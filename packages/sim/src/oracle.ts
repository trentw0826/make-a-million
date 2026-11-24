import {
  type BotStrategy,
  type HardBot,
  HeuristicBot,
  makeSpecialsWeight,
  pimcValues,
} from '@mam/bots';
import {
  type Action,
  type CardId,
  cardById,
  type GameState,
  nextSeat,
  type Observation,
  partnerOf,
  type Rng,
  type Seat,
} from '@mam/engine';
import { buildBelief, playStateFromGame, Solver } from '@mam/search';
import type { OracleStrategy } from './strategies';

/**
 * Evaluation-only: plays cards with every hand visible, using the open-hand solver
 * (exact with `exactTricks` or fewer tricks left, otherwise `depth` tricks deep).
 * Contract decisions come from the Normal bot. It measures how much any observation-only
 * bot leaves on the table; it must never be offered for live play.
 */
export class OracleBot implements OracleStrategy {
  readonly id: string = 'oracle';
  readonly needsState = true as const;

  /**
   * `base` makes every decision the oracle does not (contract decisions, and card play
   * with more than `fromTricks` tricks left); by default the Normal bot.
   */
  constructor(
    private readonly exactTricks = 7,
    private readonly depth = 3,
    private readonly base: BotStrategy = new HeuristicBot(),
    private readonly fromTricks = 13,
  ) {
    if (fromTricks < 13) this.id = `oracle-last-${fromTricks}`;
  }

  async decideWithState(state: GameState, seat: Seat, obs: Observation, rng: Rng): Promise<Action> {
    if (obs.legal.kind !== 'play') return this.base.decide(obs, rng);
    const live = obs.handSizes.reduce((a, b) => a + b, 0) + (obs.currentTrick?.plays.length ?? 0);
    if (live > this.fromTricks * 4) return this.base.decide(obs, rng);
    if (obs.legal.cardIds.length === 1)
      return { type: 'playCard', cardId: obs.legal.cardIds[0] as number };
    const s = playStateFromGame(state);
    const solver = new Solver({ mode: 'linear' });
    if (s.cardsInHands + s.trickCount > this.exactTricks * 4) solver.depthTricks = this.depth;
    const { moves, values } = solver.rootValues(s);
    const team0 = seat % 2 === 0;
    let best = 0;
    for (let i = 1; i < moves.length; i++) {
      const v = values[i] as number;
      if (team0 ? v > (values[best] as number) : v < (values[best] as number)) best = i;
    }
    return { type: 'playCard', cardId: moves[best] as number };
  }
}

/** Card groups a `peek` spec can reveal (joined with "+", e.g. "money+trumps"). */
export const PEEK_GROUPS = [
  'tiger',
  'bull',
  'bear',
  'money',
  'trumps',
  'partner',
  'lho',
  'rho',
  'pile',
  'all',
] as const;
export type PeekGroup = (typeof PEEK_GROUPS)[number];

const MONEY_RANKS = new Set([4, 8, 10, 11, 12]);

/**
 * Where the cards that `groups` reveal really are, for `seat` in the playing phase: each
 * other seat's matching cards, and (for anyone but the bidder) the matching discards.
 */
export function peekPins(
  state: GameState,
  seat: Seat,
  groups: readonly PeekGroup[],
): Map<CardId, Seat | 'pile'> {
  const hand = state.hand;
  const pins = new Map<CardId, Seat | 'pile'>();
  if (!hand || hand.trump === null) return pins;
  const trump = hand.trump;
  const has = (g: PeekGroup) => groups.includes(g) || groups.includes('all');
  const cardShown = (c: CardId): boolean => {
    const card = cardById(c);
    if (card.kind === 'tiger') return has('tiger') || has('trumps');
    if (card.kind === 'bull') return has('bull');
    if (card.kind !== 'suit') return has('bear');
    return (has('money') && MONEY_RANKS.has(c % 13)) || (has('trumps') && card.suit === trump);
  };
  const seatShown = (s: Seat): boolean =>
    (has('partner') && s === partnerOf(seat)) ||
    (has('lho') && s === nextSeat(seat)) ||
    (has('rho') && nextSeat(s) === seat);
  for (const s of [0, 1, 2, 3] as Seat[]) {
    if (s === seat) continue;
    for (const c of hand.hands[s]) if (seatShown(s) || cardShown(c)) pins.set(c, s);
  }
  if (hand.contract?.bidder !== seat) {
    for (const c of hand.discards) if (has('pile') || cardShown(c)) pins.set(c, 'pile');
  }
  return pins;
}

/**
 * Evaluation-only: a Hard-family bot's card play, except that its sampled worlds put the
 * cards that `groups` reveal where they really are (card play with `fromTricks` or fewer
 * tricks left). Worlds are sampled exactly, conditioned on those placements, and still
 * weighted by the bot's own specials inference. Measures what knowing those cards is worth:
 * the most that inferring them could gain.
 */
export class PeekBot implements OracleStrategy {
  readonly id: string;
  readonly needsState = true as const;
  private readonly heuristic = new HeuristicBot();

  constructor(
    private readonly groups: readonly PeekGroup[],
    private readonly hard: HardBot,
    private readonly fromTricks = 13,
  ) {
    this.id = `peek-${groups.join('+')}${fromTricks < 13 ? `-last-${fromTricks}` : ''}`;
  }

  async decideWithState(state: GameState, seat: Seat, obs: Observation, rng: Rng): Promise<Action> {
    if (obs.legal.kind !== 'play') return this.hard.decide(obs, rng);
    const live = obs.handSizes.reduce((a, b) => a + b, 0) + (obs.currentTrick?.plays.length ?? 0);
    if (live > this.fromTricks * 4) return this.hard.decide(obs, rng);
    const legal = obs.legal.cardIds;
    if (legal.length === 1) return { type: 'playCard', cardId: legal[0] as number };
    const o = this.hard.options;
    const belief = buildBelief(obs, peekPins(state, seat, this.groups));
    const weight = o.inferencePool > 0 && o.specialsInference ? makeSpecialsWeight(obs) : undefined;
    const result = pimcValues(obs, rng, o, { belief, ...(weight ? { weight } : {}) });
    const preferred = this.heuristic.decide(obs, rng);
    const preferredCard = preferred.type === 'playCard' ? preferred.cardId : -1;
    let best = 0;
    for (let i = 1; i < result.moves.length; i++) {
      if ((result.means[i] as number) > (result.means[best] as number)) best = i;
    }
    const pi = result.moves.indexOf(preferredCard);
    if (pi >= 0 && (result.means[pi] as number) >= (result.means[best] as number) - 1e-9) {
      return { type: 'playCard', cardId: preferredCard };
    }
    return { type: 'playCard', cardId: result.moves[best] as number };
  }
}
