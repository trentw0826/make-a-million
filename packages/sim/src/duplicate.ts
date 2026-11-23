import {
  DEFAULT_RULESET,
  decideWinner,
  nextSeat,
  otherTeam,
  Rng,
  type Seat,
  type Team,
  teamOf,
} from '@mam/engine';
import { lookupEquity, type MatchEquityTable } from '@mam/search';
import { runParallel } from './parallel';
import { RunningStats, Sprt, type SprtDecision, type SprtOptions } from './stats';
import type { BotSpec } from './strategies';
import type { HandLine, PlayInput, PlayOutput, SlowDecision, TimingSummary } from './tasks';

/** A deal at a point in a game: replayed twice with the teams swapped. */
export interface Board {
  readonly seed: string;
  readonly dealer: Seat;
  readonly scores: readonly [number, number];
}

export interface HandStart {
  readonly dealer: Seat;
  readonly scores: readonly [number, number];
}

/** Realistic hand-start positions taken from self-play games. */
export function handStarts(games: readonly PlayOutput[]): HandStart[] {
  return games.flatMap((g) => g.hands.map((h) => ({ dealer: h.dealer, scores: h.scoresBefore })));
}

export function makeBoards(count: number, seed: string, pool: readonly HandStart[]): Board[] {
  const rng = Rng.fromSeed(`boards:${seed}`);
  const boards: Board[] = [];
  for (let i = 0; i < count; i++) {
    const start =
      pool.length > 0 ? rng.pick(pool) : { dealer: (i % 4) as Seat, scores: [0, 0] as const };
    boards.push({ seed: `${seed}:board:${i}`, dealer: start.dealer, scores: start.scores });
  }
  return boards;
}

/** Equity for `team` once a hand has been scored. */
export function equityAfter(
  line: Pick<HandLine, 'scoresAfter' | 'bidder' | 'dealer'>,
  team: Team,
  table: MatchEquityTable,
  target = DEFAULT_RULESET.targetScore,
): number {
  const winner = decideWinner(line.scoresAfter, teamOf(line.bidder), {
    ...DEFAULT_RULESET,
    targetScore: target,
  });
  if (winner !== null) return winner === team ? 1 : 0;
  const nextDealerTeam = teamOf(nextSeat(line.dealer));
  return lookupEquity(
    table,
    line.scoresAfter[team],
    line.scoresAfter[otherTeam(team)],
    nextDealerTeam === team,
  );
}

export interface BoardResult {
  readonly board: Board;
  /** A's equity minus B's, summed over both orientations (0 when equal). In equity units. */
  readonly me: number;
  /** Average over both orientations of (A's score change − B's score change), in points. */
  readonly margin: number;
  readonly lines: readonly [HandLine, HandLine];
}

export function scoreBoard(
  board: Board,
  o0: PlayOutput,
  o1: PlayOutput,
  table: MatchEquityTable | null,
): BoardResult {
  const l0 = o0.hands[0];
  const l1 = o1.hands[0];
  if (!l0 || !l1) throw new Error(`board ${board.seed} produced no hand`);
  // Orientation 0: A sits as team 0. Orientation 1: A sits as team 1.
  const change = (l: HandLine, t: Team) => l.scoresAfter[t] - l.scoresBefore[t];
  const margin = (change(l0, 0) - change(l0, 1) + (change(l1, 1) - change(l1, 0))) / 2;
  const me = table ? equityAfter(l0, 0, table) + equityAfter(l1, 1, table) - 1 : 0;
  return { board, me, margin, lines: [l0, l1] };
}

export interface ContractStats {
  contracts: number;
  made: number;
  bidTotal: number;
}

export interface DuplicateResult {
  readonly boards: number;
  readonly me: { mean: number; ci95: readonly [number, number] };
  readonly margin: { mean: number; ci95: readonly [number, number] };
  readonly sprt: SprtDecision | null;
  readonly llr: number | null;
  readonly contractsA: ContractStats;
  readonly contractsB: ContractStats;
  readonly timingA: { decisions: number; meanMs: number; maxMs: number };
  readonly timingB: { decisions: number; meanMs: number; maxMs: number };
  readonly elapsedMs: number;
  readonly slow: readonly SlowDecision[];
}

export interface DuplicateOptions {
  readonly a: BotSpec;
  readonly b: BotSpec;
  readonly boards: readonly Board[];
  readonly table: MatchEquityTable | null;
  readonly workers?: number;
  /** Stop early with an SPRT on the per-board equity score. */
  readonly sprt?: SprtOptions;
  readonly onBoard?: (index: number, result: BoardResult) => void;
}

/** Plays every board twice (A as team 0, then as team 1) and compares A with B. */
export async function runDuplicate(opts: DuplicateOptions): Promise<DuplicateResult> {
  const started = performance.now();
  const inputs: PlayInput[] = opts.boards.flatMap((board) => [
    {
      seed: board.seed,
      dealer: board.dealer,
      scores: board.scores,
      hands: 1,
      specs: [opts.a, opts.b, opts.a, opts.b],
    },
    {
      seed: board.seed,
      dealer: board.dealer,
      scores: board.scores,
      hands: 1,
      specs: [opts.b, opts.a, opts.b, opts.a],
    },
  ]);
  const me = new RunningStats();
  const margin = new RunningStats();
  const sprt = opts.sprt ? new Sprt(opts.sprt) : null;
  let decision: SprtDecision | null = sprt ? 'continue' : null;
  const contractsA: ContractStats = { contracts: 0, made: 0, bidTotal: 0 };
  const contractsB: ContractStats = { contracts: 0, made: 0, bidTotal: 0 };
  const tA = { decisions: 0, totalMs: 0, maxMs: 0 };
  const tB = { decisions: 0, totalMs: 0, maxMs: 0 };
  let pending: PlayOutput | null = null;
  let boards = 0;
  const slow: SlowDecision[] = [];

  const addTiming = (into: typeof tA, t: TimingSummary) => {
    into.decisions += t.decisions;
    into.totalMs += t.totalMs;
    into.maxMs = Math.max(into.maxMs, t.maxMs);
  };

  await runParallel('play', inputs, {
    ...(opts.workers !== undefined ? { workers: opts.workers } : {}),
    onResult: (index, out) => {
      if (index % 2 === 0) {
        pending = out;
        return true;
      }
      const o0 = pending as unknown as PlayOutput;
      const board = opts.boards[(index - 1) / 2] as Board;
      const result = scoreBoard(board, o0, out, opts.table);
      boards += 1;
      me.push(result.me);
      margin.push(result.margin);
      // Seats: orientation 0 has A at seats 0/2, orientation 1 at seats 1/3.
      for (const [o, aTeam] of [
        [o0, 0],
        [out, 1],
      ] as const) {
        for (const seat of [0, 1, 2, 3] as const) {
          addTiming(teamOf(seat) === aTeam ? tA : tB, o.timing[seat]);
        }
        const line = o.hands[0] as HandLine;
        const stats = teamOf(line.bidder) === aTeam ? contractsA : contractsB;
        stats.contracts += 1;
        stats.bidTotal += line.bid;
        if (line.made) stats.made += 1;
      }
      for (const s of [...o0.slow, ...out.slow]) if (slow.length < 25) slow.push(s);
      opts.onBoard?.(boards - 1, result);
      if (sprt) {
        decision = sprt.push(result.me);
        if (decision !== 'continue') return false;
      }
      return true;
    },
  });

  const summary = (t: typeof tA) => ({
    decisions: t.decisions,
    meanMs: t.decisions ? t.totalMs / t.decisions : 0,
    maxMs: t.maxMs,
  });
  return {
    boards,
    me: { mean: me.mean, ci95: me.ci95 },
    margin: { mean: margin.mean, ci95: margin.ci95 },
    sprt: decision,
    llr: sprt ? sprt.llr : null,
    contractsA,
    contractsB,
    timingA: summary(tA),
    timingB: summary(tB),
    elapsedMs: performance.now() - started,
    slow,
  };
}
