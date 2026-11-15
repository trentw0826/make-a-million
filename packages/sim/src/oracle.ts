import { type BotStrategy, type HardBot, HeuristicBot, pimcValues } from '@mam/bots';
import type { Action, CardId, GameState, Observation, Rng, Seat } from '@mam/engine';
import { playStateFromGame, Solver, type World } from '@mam/search';
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

/**
 * Evaluation-only: Hard's card play, except that its sampled worlds must place the `peek`
 * cards where they really are (card play with `fromTricks` or fewer tricks left). Measures
 * what knowing just those cards is worth, i.e. the most that inferring them could gain.
 */
export class PeekBot implements OracleStrategy {
  readonly id: string;
  readonly needsState = true as const;
  private readonly heuristic = new HeuristicBot();

  constructor(
    private readonly peek: readonly CardId[],
    private readonly hard: HardBot,
    private readonly fromTricks = 13,
    /** Candidate worlds drawn per kept world, to find enough consistent ones. */
    private readonly pool = 40,
  ) {
    this.id = `peek-${peek.join('+')}${fromTricks < 13 ? `-last-${fromTricks}` : ''}`;
  }

  async decideWithState(
    state: GameState,
    _seat: Seat,
    obs: Observation,
    rng: Rng,
  ): Promise<Action> {
    if (obs.legal.kind !== 'play') return this.hard.decide(obs, rng);
    const live = obs.handSizes.reduce((a, b) => a + b, 0) + (obs.currentTrick?.plays.length ?? 0);
    if (live > this.fromTricks * 4) return this.hard.decide(obs, rng);
    const legal = obs.legal.cardIds;
    if (legal.length === 1) return { type: 'playCard', cardId: legal[0] as number };
    const hand = state.hand;
    if (!hand) throw new Error('no hand');
    // Where each peeked card is, if someone else still holds it (or it was discarded).
    const where: { card: CardId; seat: Seat | null }[] = [];
    for (const card of this.peek) {
      if (obs.hand.includes(card)) continue;
      const holder = ([0, 1, 2, 3] as Seat[]).find((s) => hand.hands[s].includes(card));
      // The kept widow is in the bidder's hand by now; played cards need no constraint.
      if (holder !== undefined) where.push({ card, seat: holder });
      else if (hand.discards.includes(card)) where.push({ card, seat: null });
    }
    const weight = (w: World) =>
      where.every(({ card, seat: s }) =>
        s === null ? w.pile.includes(card) : (w.hands[s] ?? []).includes(card),
      )
        ? 1
        : 0;
    const result = pimcValues(
      obs,
      rng,
      { ...this.hard.options, inferencePool: this.pool },
      { weight },
    );
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
