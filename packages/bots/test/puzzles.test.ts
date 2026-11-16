import {
  applyActionOrThrow,
  BEAR_ID,
  BULL_ID,
  type CardId,
  DEFAULT_RULESET,
  type GameState,
  observe,
  RANKS,
  type Rank,
  Rng,
  type Seat,
  SUITS,
  type Suit,
  TIGER_ID,
} from '@mam/engine';
import type { Belief, World } from '@mam/search';
import { describe, expect, it } from 'vitest';
import { HARD_DEFAULTS, pimcValues } from '../src/hard/index';

const LETTER: Record<string, Suit> = { R: 'red', Y: 'yellow', B: 'black', G: 'green' };
function c(spec: string): CardId {
  if (spec === 'T') return TIGER_ID;
  if (spec === 'BU') return BULL_ID;
  if (spec === 'BE') return BEAR_ID;
  return (
    SUITS.indexOf(LETTER[spec[0] as string] as Suit) * 13 + RANKS.indexOf(spec.slice(1) as Rank)
  );
}
const cards = (...specs: string[]) => specs.map(c).sort((a, b) => a - b);

/** A hand in the playing phase: seat 0 bid and leads; plays `played` in order, then asks. */
function puzzle(
  hands: [string[], string[], string[], string[]],
  played: string[],
  trump: Suit = 'red',
): { state: GameState; seat: Seat } {
  let state: GameState = {
    ruleset: DEFAULT_RULESET,
    seed: 'puzzle',
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
      hands: hands.map((h) => cards(...h)) as unknown as GameState['hand'] extends infer H
        ? H extends { hands: infer X }
          ? X
          : never
        : never,
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
      trump,
      tricks: [],
      currentTrick: { leader: 0, plays: [], suit: null, winner: null },
      turn: 0,
      result: null,
      continuePending: [],
    },
  };
  let seat: Seat = 0;
  for (const spec of played) {
    state = applyActionOrThrow(state, seat, { type: 'playCard', cardId: c(spec) }).state;
    seat = ((seat + 1) % 4) as Seat;
  }
  return { state, seat };
}

/**
 * Every way to deal the cards the other seats now hold among them (hand sizes kept): what
 * the deciding seat cannot tell apart in these puzzles. The discards are fixed.
 */
function puzzleBelief(state: GameState, seat: Seat): Belief {
  const hand = state.hand;
  if (!hand) throw new Error('no hand');
  const others = ([0, 1, 2, 3] as Seat[]).filter((s) => s !== seat) as [Seat, Seat, Seat];
  const pool = others.flatMap((s) => [...hand.hands[s]]);
  const sizes = others.map((s) => hand.hands[s].length);
  const worlds: World[] = [];
  const rec = (i: number, rest: CardId[], acc: CardId[][]) => {
    if (i === 3) {
      const hands: CardId[][] = [[], [], [], []];
      others.forEach((s, k) => {
        hands[s] = [...(acc[k] as CardId[])].sort((a, b) => a - b);
      });
      worlds.push({ hands, pile: hand.discards });
      return;
    }
    const k = sizes[i] as number;
    const choose = (start: number, picked: CardId[]) => {
      if (picked.length === k) {
        rec(
          i + 1,
          rest.filter((r) => !picked.includes(r)),
          [...acc, picked],
        );
        return;
      }
      for (let j = start; j < rest.length; j++) choose(j + 1, [...picked, rest[j] as CardId]);
    };
    choose(0, []);
  };
  rec(0, pool, []);
  return {
    observer: seat,
    seats: others,
    capacity: [sizes[0] as number, sizes[1] as number, sizes[2] as number, 0],
    unseen: pool,
    count: worlds.length,
    sample: (rng) => worlds[rng.int(worlds.length)] as World,
    enumerate: (max) => (worlds.length <= max ? worlds : null),
  };
}

function hardChoice(state: GameState, seat: Seat): CardId {
  const obs = observe(state, seat);
  const r = pimcValues(obs, Rng.fromSeed('puzzle'), HARD_DEFAULTS, {
    belief: puzzleBelief(state, seat),
  });
  let best = 0;
  for (let i = 1; i < r.moves.length; i++) {
    if ((r.means[i] as number) > (r.means[best] as number)) best = i;
  }
  return r.moves[best] as CardId;
}

describe('Hard bot puzzles (exact endgames)', () => {
  it('cancels a rich trick it cannot win with the Bear', () => {
    // Opponents (0, 2) are taking $70k in yellow; seat 3 has no yellow and no trump.
    const { state, seat } = puzzle(
      [
        ['Y40k', 'R1'],
        ['Y1', 'R2'],
        ['Y30k', 'R3'],
        ['G1', 'BE'],
      ],
      ['Y40k', 'Y1', 'Y30k'],
    );
    expect(seat).toBe(3);
    expect(hardChoice(state, seat)).toBe(c('BE'));
  });

  it('wins cheaply and keeps the big card for later', () => {
    // Seat 3 can win now with the 11 or the $40k; the $40k is better cashed next trick.
    const { state, seat } = puzzle(
      [
        ['Y9', 'G1'],
        ['Y2', 'G2'],
        ['Y10k', 'G3'],
        ['Y11', 'Y40k'],
      ],
      ['Y9', 'Y2', 'Y10k'],
    );
    expect(hardChoice(state, seat)).toBe(c('Y11'));
  });

  it('plays the Bull on its partner’s rich, safe trick', () => {
    // Partner (seat 1) holds the trick with the trump $40k; seat 3 is void in yellow.
    const { state, seat } = puzzle(
      [
        ['Y30k', 'G1'],
        ['R40k', 'G2'],
        ['Y15k', 'G3'],
        ['BU', 'G4'],
      ],
      ['Y30k', 'R40k', 'Y15k'],
    );
    expect(hardChoice(state, seat)).toBe(c('BU'));
  });
});
