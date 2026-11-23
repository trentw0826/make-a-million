import { type Seat, teamOf } from '@mam/engine';
import { playStateFromGame, Solver } from '@mam/search';
import { playGame } from './runner';
import { makeStrategy } from './strategies';
import type { PlayInput } from './tasks';

/**
 * Diagnostic: where a bot's card play loses against the all-seeing solver. At every card
 * play with a choice by a measured seat, the true deal is solved with all hands open (exact
 * with `exactTricks` or fewer tricks left, otherwise `depth` tricks deep plus the greedy
 * playout, as the oracle does) and the chosen card is scored against the best one.
 *
 * The regret mixes what no player can know with what a better bot could avoid; it shows
 * where (trick, lead or follow, declaring or defending) the gap to the oracle is.
 */
export interface RegretLine {
  /** Index of the trick being played, 0–12. */
  readonly trick: number;
  /** Position in the trick: 0 leads. */
  readonly pos: number;
  /** The deciding seat's team holds the contract. */
  readonly declaring: boolean;
  /** Legal cards, and distinct values among them. */
  readonly legal: number;
  readonly distinct: number;
  /** Best value minus the chosen card's value, for the seat's team ($1000s, ≥ 0). */
  readonly regretK: number;
  /** The solve was exact (not depth-limited). */
  readonly exact: boolean;
}

export interface RegretInput extends PlayInput {
  /** Seats whose decisions are measured (default all four). */
  readonly seats?: readonly Seat[];
  readonly exactTricks?: number;
  readonly depth?: number;
}

export async function regretTask(input: RegretInput): Promise<RegretLine[]> {
  const strategies = input.specs.map(makeStrategy) as unknown as Parameters<
    typeof playGame
  >[0]['strategies'];
  const measured = new Set(input.seats ?? [0, 1, 2, 3]);
  const exactTricks = input.exactTricks ?? 7;
  const depth = input.depth ?? 3;
  const out: RegretLine[] = [];
  await playGame({
    seed: input.seed,
    dealer: input.dealer,
    strategies,
    ...(input.scores ? { scores: input.scores } : {}),
    hands: input.hands ?? 1,
    ...(input.ruleset ? { ruleset: input.ruleset } : {}),
    onDecision: ({ seat, state, obs, action }) => {
      if (!measured.has(seat) || obs.legal.kind !== 'play' || action.type !== 'playCard') return;
      if (obs.legal.cardIds.length < 2 || !obs.contract) return;
      const s = playStateFromGame(state);
      const solver = new Solver({ mode: 'linear', maxEntries: 400_000 });
      const exact = s.cardsInHands + s.trickCount <= exactTricks * 4;
      if (!exact) solver.depthTricks = depth;
      const { moves, values } = solver.rootValues(s);
      const sign = teamOf(seat) === 0 ? 1 : -1;
      const own = values.map((v) => sign * v);
      const best = Math.max(...own);
      const chosen = own[moves.indexOf(action.cardId)];
      if (chosen === undefined) throw new Error('regret: chosen card not among the legal moves');
      out.push({
        trick: obs.tricks.length,
        pos: obs.currentTrick?.plays.length ?? 0,
        declaring: teamOf(seat) === teamOf(obs.contract.bidder),
        legal: moves.length,
        distinct: new Set(own).size,
        regretK: best - chosen,
        exact,
      });
    },
  });
  return out;
}
