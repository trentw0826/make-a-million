import {
  BEAR_ID,
  BULL_ID,
  type CardId,
  cardById,
  DEFAULT_RULESET,
  moneyValue,
  type Observation,
  RANKS,
  type Rank,
  Rng,
  SUITS,
  type Suit,
  TIGER_ID,
} from '@mam/engine';
import { describe, expect, it } from 'vitest';
import { analyze, isBoss } from '../src/heuristic/analysis';
import { chooseDiscards } from '../src/heuristic/discard';
import { bestTrump, expectedTricks } from '../src/heuristic/evaluate';
import { HeuristicBot } from '../src/heuristic/index';

const SUIT_LETTER: Record<string, Suit> = { R: 'red', Y: 'yellow', B: 'black', G: 'green' };
function c(spec: string): CardId {
  if (spec === 'T') return TIGER_ID;
  if (spec === 'BU') return BULL_ID;
  if (spec === 'BE') return BEAR_ID;
  return (
    SUITS.indexOf(SUIT_LETTER[spec[0] as string] as Suit) * RANKS.length +
    RANKS.indexOf(spec.slice(1) as Rank)
  );
}
const cards = (...specs: string[]) => specs.map(c);

/** A minimal observation for a seat in the play phase. */
function obsFor(partial: Partial<Observation> & { hand: CardId[] }): Observation {
  return {
    seat: 0,
    team: 0,
    ruleset: DEFAULT_RULESET,
    phase: 'playing',
    handNumber: 1,
    dealer: 3,
    redeals: 0,
    scores: [0, 0],
    handHistory: [],
    handSizes: [partial.hand.length, 13, 13, 13],
    auction: [],
    contract: { bidder: 0, amount: 175_000 },
    trump: 'red',
    widow: null,
    discards: null,
    tricks: [],
    currentTrick: { leader: 0, plays: [], suit: null, winner: null },
    turn: 0,
    legal: { kind: 'play', cardIds: partial.hand },
    result: null,
    continuePending: [],
    winner: null,
    ...partial,
  };
}

describe('hand evaluation', () => {
  it('values a hand with the Tiger and top trumps far above a weak one', () => {
    const strong = cards(
      'T',
      'R40k',
      'R30k',
      'R15k',
      'R11',
      'R9',
      'R2',
      'Y40k',
      'Y1',
      'B1',
      'B2',
      'G1',
      'G3',
    ).map(cardById);
    const weak = cards(
      'R1',
      'R2',
      'Y3',
      'Y4',
      'B1',
      'B2',
      'B7',
      'G1',
      'G2',
      'G3',
      'G4',
      'Y7',
      'B8',
    ).map(cardById);
    expect(expectedTricks(strong, 'red')).toBeGreaterThan(5);
    expect(expectedTricks(weak, 'red')).toBeLessThan(1.5);
    expect(bestTrump(strong).suit).toBe('red');
  });

  it('picks the suit with the most strength as trump', () => {
    const hand = cards(
      'G40k',
      'G30k',
      'G15k',
      'G11',
      'G9',
      'G8',
      'R1',
      'R2',
      'Y1',
      'Y2',
      'B1',
      'B2',
      'B3',
    ).map(cardById);
    expect(bestTrump(hand).suit).toBe('green');
  });
});

describe('discards', () => {
  it('discards number cards from short non-trump suits, never trumps when avoidable', () => {
    const hand = cards(
      'G40k',
      'G30k',
      'G15k',
      'G11',
      'G9',
      'G8',
      'G7',
      'R1',
      'R40k',
      'Y2',
      'Y40k',
      'B3',
      'B4',
      'B30k',
      'T',
      'BU',
    ).map(cardById);
    const chosen = chooseDiscards(hand, 3);
    expect(chosen).toHaveLength(3);
    for (const id of chosen) {
      const card = cardById(id);
      expect(card.kind).toBe('suit');
      if (card.kind === 'suit') expect(card.suit).not.toBe('green');
    }
    expect(chosen).toContain(c('R1'));
    expect(chosen).toContain(c('Y2'));
  });

  it('sheds the cheapest Money when it has to', () => {
    const hand = cards(
      'R40k',
      'R30k',
      'R15k',
      'R10k',
      'R5k',
      'Y40k',
      'Y30k',
      'Y15k',
      'Y10k',
      'Y5k',
      'B40k',
      'B30k',
      'B15k',
      'G40k',
      'G11',
      'T',
    ).map(cardById);
    const chosen = chooseDiscards(hand, 1);
    expect(chosen).toContain(c('G11'));
    const money = chosen.filter((id) => id !== c('G11')).map((id) => cardById(id));
    expect(money).toHaveLength(2);
    // The cheapest Money goes, but trumps (the best suit here is red) are kept.
    expect(chosen).toContain(c('Y5k'));
    expect(money.reduce((sum, card) => sum + moneyValue(card), 0)).toBeLessThanOrEqual(15_000);
    for (const card of money) if (card.kind === 'suit') expect(card.suit).not.toBe('red');
  });
});

describe('play', () => {
  const bot = new HeuristicBot();
  const rng = Rng.fromSeed('test');

  it('cashes a sure side-suit winner when leading', () => {
    const obs = obsFor({ hand: cards('Y40k', 'B1', 'G2') });
    expect(bot.decide(obs, rng)).toEqual({ type: 'playCard', cardId: c('Y40k') });
  });

  it('feeds Money to a partner who is securely winning', () => {
    const hand = cards('Y5k', 'Y1');
    const obs = obsFor({
      seat: 3,
      team: 1,
      hand,
      currentTrick: {
        leader: 0,
        plays: [
          { seat: 0, cardId: c('Y2') },
          { seat: 1, cardId: c('Y40k') }, // partner of seat 3
          { seat: 2, cardId: c('Y3') },
        ],
        suit: 'yellow',
        winner: null,
      },
      turn: 3,
      legal: { kind: 'play', cardIds: hand },
    });
    expect(bot.decide(obs, rng)).toEqual({ type: 'playCard', cardId: c('Y5k') });
  });

  it('wins a rich trick cheaply rather than wasting the Tiger', () => {
    const hand = cards('R1', 'T', 'G1');
    const obs = obsFor({
      seat: 3,
      team: 1,
      hand,
      currentTrick: {
        leader: 0,
        plays: [
          { seat: 0, cardId: c('Y40k') },
          { seat: 1, cardId: c('Y2') },
          { seat: 2, cardId: c('Y30k') },
        ],
        suit: 'yellow',
        winner: null,
      },
      turn: 3,
      legal: { kind: 'play', cardIds: hand },
    });
    expect(bot.decide(obs, rng)).toEqual({ type: 'playCard', cardId: c('R1') });
  });

  it('plays the Bear on a rich trick it cannot win', () => {
    const hand = cards('G1', 'BE');
    const obs = obsFor({
      seat: 3,
      team: 1,
      hand,
      currentTrick: {
        leader: 0,
        plays: [
          { seat: 0, cardId: c('Y40k') },
          { seat: 1, cardId: c('Y2') },
          { seat: 2, cardId: c('Y30k') },
        ],
        suit: 'yellow',
        winner: null,
      },
      turn: 3,
      legal: { kind: 'play', cardIds: hand },
    });
    expect(bot.decide(obs, rng)).toEqual({ type: 'playCard', cardId: c('BE') });
  });

  it('plays the Bull when its partner is taking a rich trick', () => {
    const hand = cards('G1', 'BU');
    const obs = obsFor({
      seat: 3,
      team: 1,
      hand,
      currentTrick: {
        leader: 0,
        plays: [
          { seat: 0, cardId: c('Y30k') },
          { seat: 1, cardId: c('Y40k') },
          { seat: 2, cardId: c('Y3') },
        ],
        suit: 'yellow',
        winner: null,
      },
      turn: 3,
      legal: { kind: 'play', cardIds: hand },
    });
    expect(bot.decide(obs, rng)).toEqual({ type: 'playCard', cardId: c('BU') });
  });

  it('tracks voids and unseen cards from the trick history', () => {
    const obs = obsFor({
      hand: cards('R1'),
      tricks: [
        {
          leader: 0,
          plays: [
            { seat: 0, cardId: c('Y9') },
            { seat: 1, cardId: c('Y11') },
            { seat: 2, cardId: c('G1') },
            { seat: 3, cardId: c('Y1') },
          ],
          suit: 'yellow',
          winner: 1,
        },
      ],
    });
    const a = analyze(obs);
    expect(a.voids.get(2)?.has('yellow')).toBe(true);
    expect(a.voids.get(1)?.has('yellow')).toBe(false);
    expect(a.unseen.map((card) => card.id)).not.toContain(c('Y11'));
    expect(a.unseen.map((card) => card.id)).not.toContain(c('R1'));
    expect(isBoss(a, cardById(c('Y40k')))).toBe(true);
    expect(isBoss(a, cardById(c('Y30k')))).toBe(false);
  });
});
