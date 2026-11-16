import {
  decideWinner,
  nextSeat,
  otherTeam,
  type Ruleset,
  type Seat,
  type Team,
  teamOf,
} from '@mam/engine';

/**
 * Match equity: the probability that a team goes on to win the game from a given score,
 * estimated by simulation (see packages/sim/src/matchEquity.ts). Bots maximise this rather
 * than points, so a hand is valued by what it does to the chance of winning the game.
 */
export interface MatchEquityTable {
  readonly version: number;
  /** How the table was produced, for the record. */
  readonly source: string;
  /** Target score the table was built for. */
  readonly target: number;
  /** Score grid: min, min + step, …, min + (size − 1)·step, used for both teams. */
  readonly min: number;
  readonly step: number;
  readonly size: number;
  /**
   * P(own team wins) at the start of a hand, flattened as [ownDealsNext][own][opp]:
   * index = d·size² + i·size + j, d = 1 when the own team deals the next hand.
   */
  readonly values: readonly number[];
}

/** P(own team wins) at the start of a hand, by bilinear interpolation on the grid. */
export function lookupEquity(
  table: MatchEquityTable,
  own: number,
  opp: number,
  ownDealsNext: boolean,
): number {
  const { min, step, size, values } = table;
  const fi = clamp((own - min) / step, 0, size - 1);
  const fj = clamp((opp - min) / step, 0, size - 1);
  const i0 = Math.floor(fi);
  const j0 = Math.floor(fj);
  const i1 = Math.min(i0 + 1, size - 1);
  const j1 = Math.min(j0 + 1, size - 1);
  const ti = fi - i0;
  const tj = fj - j0;
  const base = (ownDealsNext ? 1 : 0) * size * size;
  const v = (i: number, j: number) => values[base + i * size + j] as number;
  const top = v(i0, j0) * (1 - tj) + v(i0, j1) * tj;
  const bottom = v(i1, j0) * (1 - tj) + v(i1, j1) * tj;
  return top * (1 - ti) + bottom * ti;
}

/** Everything about a hand in progress that its outcome depends on. */
export interface HandContext {
  readonly ruleset: Ruleset;
  /** Cumulative scores before this hand. */
  readonly scores: readonly [number, number];
  readonly dealer: Seat;
  readonly bidder: Seat;
  readonly bid: number;
}

export interface HandOutcome {
  readonly made: boolean;
  readonly scoresAfter: readonly [number, number];
  /** Winner if the game ends with this hand, otherwise null. */
  readonly winner: Team | null;
}

/** Scores the hand exactly as the engine does (see scoreHand in packages/engine/src/reducer.ts). */
export function handOutcome(ctx: HandContext, captured: readonly [number, number]): HandOutcome {
  const bt = teamOf(ctx.bidder);
  const ot = otherTeam(bt);
  const made = captured[bt] >= ctx.bid;
  const delta: [number, number] = [0, 0];
  delta[bt] = made ? captured[bt] : -ctx.bid;
  delta[ot] = captured[ot];
  const scoresAfter: [number, number] = [ctx.scores[0] + delta[0], ctx.scores[1] + delta[1]];
  return { made, scoresAfter, winner: decideWinner(scoresAfter, bt, ctx.ruleset) };
}

export type UtilityMode = 'equity' | 'margin';

/**
 * A team's value for a finished hand, as a function of the money each team captured.
 * - 'equity': probability of winning the game afterwards (needs a table).
 * - 'margin': own score change minus the opponents' (in $100k units), a points proxy.
 * Values are zero-sum between the teams up to a constant, so alpha-beta search is valid.
 */
export type CaptureUtility = (captured: readonly [number, number]) => number;

export function captureUtility(
  ctx: HandContext,
  team: Team,
  mode: UtilityMode,
  table: MatchEquityTable | null,
): CaptureUtility {
  const opp = otherTeam(team);
  if (mode === 'margin' || !table) {
    return (captured) => {
      const { scoresAfter } = handOutcome(ctx, captured);
      return (
        (scoresAfter[team] - ctx.scores[team] - (scoresAfter[opp] - ctx.scores[opp])) / 100_000
      );
    };
  }
  const nextDealerTeam = teamOf(nextSeat(ctx.dealer));
  return (captured) => {
    const { scoresAfter, winner } = handOutcome(ctx, captured);
    if (winner !== null) return winner === team ? 1 : 0;
    return lookupEquity(table, scoresAfter[team], scoresAfter[opp], nextDealerTeam === team);
  };
}

/**
 * Final captures ($1000s) implied by a points value: from captures `cap0`/`cap1`, team 0
 * goes on to win `v` more than team 1 out of the `rest` still to be won. Exact when no Bull
 * or Bear is in a hand or in the trick in progress (the rest is then fixed). Otherwise it
 * is an estimate: they can even make |v| exceed `rest`, and the loser is then taken to win
 * nothing.
 */
export function splitRest(cap0: number, cap1: number, rest: number, v: number): [number, number] {
  let f1 = Math.max(0, (rest - v) / 2);
  let f0 = f1 + v;
  if (f0 < 0) {
    f0 = 0;
    f1 = -v;
  }
  return [cap0 + f0, cap1 + f1];
}

/** Equity of a position at the start of a hand, before anything is known. */
export function startEquity(
  table: MatchEquityTable,
  scores: readonly [number, number],
  team: Team,
  dealer: Seat,
): number {
  return lookupEquity(table, scores[team], scores[otherTeam(team)], teamOf(dealer) === team);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
