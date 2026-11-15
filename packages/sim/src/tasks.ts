import { playoutDeclare, playoutWith } from '@mam/bots';
import {
  type AuctionEntry,
  type CardId,
  createGame,
  nextSeat,
  type Ruleset,
  type Seat,
  type Team,
  teamOf,
} from '@mam/engine';
import './registry';
import { playGame } from './runner';
import { type BotSpec, makeStrategy } from './strategies';

/** One line of a hand's result, without its cards (small enough to pass between threads). */
export interface HandLine {
  readonly dealer: Seat;
  readonly scoresBefore: readonly [number, number];
  readonly scoresAfter: readonly [number, number];
  readonly bidder: Seat;
  readonly bid: number;
  readonly captured: readonly [number, number];
  readonly made: boolean;
}

export interface TimingSummary {
  readonly decisions: number;
  readonly totalMs: number;
  readonly maxMs: number;
}

export interface PlayInput {
  readonly seed: string;
  readonly dealer: Seat;
  readonly specs: readonly [BotSpec, BotSpec, BotSpec, BotSpec];
  readonly scores?: readonly [number, number];
  /** Stop after this many hands (omit to play the whole game). */
  readonly hands?: number;
  readonly ruleset?: Ruleset;
}

export interface PlayOutput {
  readonly winner: Team | null;
  readonly scores: readonly [number, number];
  readonly hands: readonly HandLine[];
  readonly steps: number;
  /** Decision timing per seat. */
  readonly timing: readonly [TimingSummary, TimingSummary, TimingSummary, TimingSummary];
  /** Decisions slower than SLOW_MS (default 5000), for diagnosing budget problems. */
  readonly slow: readonly SlowDecision[];
}

export interface SlowDecision {
  readonly spec: BotSpec;
  readonly phase: string;
  readonly ms: number;
  readonly cardsLeft: number;
  readonly trickCards: number;
  readonly legal: number;
}

const SLOW_MS = Number(process.env.SLOW_MS ?? 5000);

export async function playTask(input: PlayInput): Promise<PlayOutput> {
  const strategies = input.specs.map(makeStrategy) as unknown as Parameters<
    typeof playGame
  >[0]['strategies'];
  const timing = [0, 1, 2, 3].map(() => ({ decisions: 0, totalMs: 0, maxMs: 0 }));
  const slow: SlowDecision[] = [];
  const outcome = await playGame({
    seed: input.seed,
    dealer: input.dealer,
    strategies,
    ...(input.scores ? { scores: input.scores } : {}),
    ...(input.hands !== undefined ? { hands: input.hands } : {}),
    ...(input.ruleset ? { ruleset: input.ruleset } : {}),
    onDecision: ({ seat, ms, obs }) => {
      const t = timing[seat] as { decisions: number; totalMs: number; maxMs: number };
      t.decisions += 1;
      t.totalMs += ms;
      t.maxMs = Math.max(t.maxMs, ms);
      if (ms >= SLOW_MS) {
        slow.push({
          spec: input.specs[seat],
          phase: obs.phase,
          ms: Math.round(ms),
          cardsLeft: obs.handSizes.reduce((a, b) => a + b, 0),
          trickCards: obs.currentTrick?.plays.length ?? 0,
          legal: obs.legal.kind === 'play' ? obs.legal.cardIds.length : 0,
        });
      }
    },
  });
  const start = input.scores ?? [0, 0];
  const hands = outcome.state.handHistory.map((r, i, all) => ({
    dealer: r.dealer,
    scoresBefore: i === 0 ? start : (all[i - 1]?.scoresAfter ?? start),
    scoresAfter: r.scoresAfter,
    bidder: r.bidder,
    bid: r.bid,
    captured: r.captured,
    made: r.made,
  }));
  return {
    winner: outcome.state.winner,
    scores: outcome.state.scores,
    hands,
    steps: outcome.steps,
    timing: timing as unknown as PlayOutput['timing'],
    slow,
  };
}

/** One contract, with what the bidding's playout estimate predicted for it. */
export interface CalibrationLine {
  readonly bidder: Seat;
  readonly bid: number;
  readonly made: boolean;
  /** Money the bidding team actually captured. */
  readonly actual: number;
  /**
   * The bidding's estimate (greedy open-hand playout, heuristic discards and trump) on the
   * true deal, and the same playout with the discards and trump actually chosen.
   */
  readonly estimate: number;
  readonly estimateChosen: number;
  readonly auction: readonly AuctionEntry[];
}

/**
 * Plays one hand and compares the bidder's capture with the contract estimator's
 * prediction (null when there was no contract or the hand was redealt).
 */
export async function calibrateTask(input: PlayInput): Promise<CalibrationLine | null> {
  const first = createGame({
    seed: input.seed,
    dealer: input.dealer,
    ...(input.scores ? { scores: input.scores } : {}),
    ...(input.ruleset ? { ruleset: input.ruleset } : {}),
  }).hand;
  const strategies = input.specs.map(makeStrategy) as unknown as Parameters<
    typeof playGame
  >[0]['strategies'];
  const { state } = await playGame({
    seed: input.seed,
    dealer: input.dealer,
    strategies,
    hands: 1,
    ...(input.scores ? { scores: input.scores } : {}),
    ...(input.ruleset ? { ruleset: input.ruleset } : {}),
  });
  const r = state.handHistory[0];
  if (!first || !r || r.redeals > 0) return null;
  const kept: CardId[] = [];
  for (const t of r.tricks) {
    let seat = t.leader;
    for (const c of t.cardIds) {
      if (seat === r.bidder) kept.push(c);
      seat = nextSeat(seat);
    }
  }
  const team = teamOf(r.bidder);
  const deal = { hands: first.hands, widow: first.widow };
  return {
    bidder: r.bidder,
    bid: r.bid,
    made: r.made,
    actual: r.captured[team],
    estimate: (playoutDeclare(deal, r.bidder)[team] as number) * 1000,
    estimateChosen: (playoutWith(first.hands, r.bidder, kept, r.trump)[team] as number) * 1000,
    auction: state.hand?.auction.entries ?? [],
  };
}

export const TASKS = {
  play: playTask,
  calibrate: calibrateTask,
} as const;

export type TaskName = keyof typeof TASKS;
export type TaskInput<N extends TaskName> = Parameters<(typeof TASKS)[N]>[0];
export type TaskOutput<N extends TaskName> = Awaited<ReturnType<(typeof TASKS)[N]>>;

export function runTask<N extends TaskName>(name: N, input: TaskInput<N>): Promise<TaskOutput<N>> {
  return (TASKS[name] as (i: TaskInput<N>) => Promise<TaskOutput<N>>)(input);
}
