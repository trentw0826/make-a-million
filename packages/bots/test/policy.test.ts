import {
  applyActionOrThrow,
  createGame,
  type GameState,
  legalMoves,
  observe,
  playableCards,
  Rng,
  SEATS,
  type Seat,
  type Trick,
} from '@mam/engine';
import { buildBelief } from '@mam/search';
import { describe, expect, it } from 'vitest';
import { HARD_DEFAULTS, HardBot } from '../src/hard/index';
import { HeuristicBot } from '../src/heuristic/index';
import { makePolicyWeight, PLAY_FEATURE_COUNT, playFeatures } from '../src/inference/policy';

/** A Normal-driven hand, stopped after `plays` cards of the play phase. */
function midHand(seed: string, plays: number): GameState {
  let state = createGame({ seed });
  const normal = new HeuristicBot();
  const rng = Rng.fromSeed(seed);
  let played = 0;
  while (!(state.hand?.phase === 'playing' && played >= plays)) {
    const seat = SEATS.find((s) => legalMoves(state, s).kind !== 'none');
    if (seat === undefined) throw new Error('stuck');
    if (state.hand?.phase === 'playing') played += 1;
    state = applyActionOrThrow(state, seat, normal.decide(observe(state, seat), rng)).state;
  }
  return state;
}

/** Some fitted-looking weights, so the test exercises a model that is not uniform. */
const MODEL = {
  source: 'test',
  features: [],
  weights: Array.from({ length: PLAY_FEATURE_COUNT }, (_, i) => Math.sin(i + 1) * 1.5),
};

describe('policy-based inference', () => {
  it('gives one feature row per legal card', () => {
    const state = midHand('policy-rows', 13);
    const seat = state.hand?.turn as Seat;
    const obs = observe(state, seat);
    if (obs.legal.kind !== 'play' || obs.trump === null) throw new Error('not playing');
    const prefix: Trick = obs.currentTrick ?? { leader: seat, plays: [], suit: null, winner: null };
    const legal = playableCards(obs.hand, prefix, obs.trump);
    expect([...legal].sort()).toEqual([...obs.legal.cardIds].sort());
    const rows = playFeatures(obs.hand, legal, prefix, obs.trump, seat, new Set());
    expect(rows).toHaveLength(legal.length);
    for (const r of rows) {
      expect(r).toHaveLength(PLAY_FEATURE_COUNT);
      expect([...r].every(Number.isFinite)).toBe(true);
    }
  });

  it('never rules out the true deal', () => {
    for (let i = 0; i < 10; i++) {
      const state = midHand(`policy-truth-${i}`, 6 + 4 * i);
      const seat = state.hand?.turn as Seat;
      const obs = observe(state, seat);
      const weight = makePolicyWeight(obs, MODEL);
      if (!weight) continue;
      const hand = state.hand;
      if (!hand) throw new Error('no hand');
      const truth = {
        hands: hand.hands.map((h, s) => (s === seat ? [] : [...h])),
        pile: obs.contract?.bidder === seat ? [] : [...hand.discards],
      };
      expect(weight(truth)).toBeGreaterThan(0);
    }
  });

  it('decides from the observation alone (hidden cards replaced: same card)', () => {
    const bot = new HardBot({ ...HARD_DEFAULTS, worlds: 8, nodes: 300_000, policyInference: true });
    for (let i = 0; i < 6; i++) {
      const state = midHand(`policy-leak-${i}`, 10 + 5 * i);
      const hand = state.hand;
      const seat = hand?.turn as Seat;
      if (!hand) throw new Error('no hand');
      const obs = observe(state, seat);
      // Another deal the seat cannot tell from the true one.
      const world = buildBelief(obs).sample(Rng.fromSeed(`other-${i}`));
      const hands = hand.hands.map((h, s) => (s === seat ? h : [...(world.hands[s] ?? [])]));
      const bidder = hand.contract?.bidder;
      const other: GameState = {
        ...state,
        hand: {
          ...hand,
          hands: hands as unknown as typeof hand.hands,
          ...(bidder === seat ? {} : { discards: [...world.pile], widow: [...world.pile] }),
        },
      };
      const obs2 = observe(other, seat);
      expect(obs2).toEqual(obs);
      expect(bot.decide(obs2, Rng.fromSeed('d'))).toEqual(bot.decide(obs, Rng.fromSeed('d')));
    }
  });
});
