import {
  applyActionOrThrow,
  type CardId,
  DEFAULT_RULESET,
  type GameState,
  observe,
  RANKS,
  type Rank,
  SUITS,
  type Suit,
} from '@mam/engine';
import type { World } from '@mam/search';
import { describe, expect, it } from 'vitest';
import { makeWorldWeight } from '../src/inference/index';

const LETTER: Record<string, Suit> = { R: 'red', Y: 'yellow', B: 'black', G: 'green' };
const c = (spec: string): CardId =>
  SUITS.indexOf(LETTER[spec[0] as string] as Suit) * 13 + RANKS.indexOf(spec.slice(1) as Rank);
const cards = (...specs: string[]) => specs.map(c).sort((a, b) => a - b);

/** Seat 0 leads the yellow $40k; seat 1, void in yellow, throws the green $30k. */
function position(): GameState {
  let state: GameState = {
    ruleset: DEFAULT_RULESET,
    seed: 'inference',
    rngState: [1, 2, 3, 4],
    phase: 'playing',
    scores: [0, 0],
    dealer: 3,
    handHistory: [],
    winner: null,
    hand: {
      handNumber: 1,
      dealer: 3,
      redeals: 0,
      phase: 'playing',
      hands: [cards('Y40k', 'R1'), cards('G30k', 'G1'), cards('Y1', 'R2'), cards('Y2', 'R3')],
      widow: cards('B1', 'B2', 'B3'),
      discards: cards('B1', 'B2', 'B3'),
      misdeal: { pending: [], eligible: [] },
      auction: {
        entries: [{ seat: 0, kind: 'bid', amount: 175_000 }],
        passed: [1, 2, 3],
        turn: 0,
        highBid: { bidder: 0, amount: 175_000 },
      },
      contract: { bidder: 0, amount: 175_000 },
      trump: 'red',
      tricks: [],
      currentTrick: { leader: 0, plays: [], suit: null, winner: null },
      turn: 0,
      result: null,
      continuePending: [],
    },
  };
  state = applyActionOrThrow(state, 0, { type: 'playCard', cardId: c('Y40k') }).state;
  state = applyActionOrThrow(state, 1, { type: 'playCard', cardId: c('G30k') }).state;
  return state;
}

describe('throw-off inference', () => {
  const obs = observe(position(), 2);
  const world = (seat1: string[], seat0: string[]): World => ({
    hands: [cards(...seat0), cards(...seat1), [], cards('Y2', 'R3')],
    pile: cards('B1', 'B2', 'B3'),
  });

  it('down-weights worlds where the thrower had a cheaper card', () => {
    const on = makeWorldWeight(obs, { throwOffs: true, temperature: 1 });
    const off = makeWorldWeight(obs, { throwOffs: false, temperature: 1 });
    const cheaperAvailable = world(['G1'], ['R1']);
    const nothingCheaper = world(['G40k'], ['R1']);
    expect(on(cheaperAvailable) / off(cheaperAvailable)).toBeCloseTo(0.35);
    expect(on(nothingCheaper) / off(nothingCheaper)).toBeCloseTo(1);
  });
});
