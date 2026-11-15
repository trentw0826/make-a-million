import { BEAR_ID, BULL_ID, cardById, cardLabel, DECK, SUITS, TIGER_ID } from '@mam/engine';
import { describe, expect, it } from 'vitest';
import { displayGroup, displayOrder } from '../src/handOrder';

/** "$40k Red", "Tiger": readable names, so a failure shows the order at a glance. */
const names = (ids: readonly number[]) =>
  ids.map((id) => {
    const card = cardById(id);
    return card.kind === 'suit' ? `${cardLabel(card)} ${card.suit}` : cardLabel(card);
  });

const RANKS_HIGH_FIRST = [
  '$40k',
  '$30k',
  '$15k',
  '11',
  '$10k',
  '9',
  '8',
  '7',
  '$5k',
  '4',
  '3',
  '2',
  '1',
];
const color = (suit: string) => RANKS_HIGH_FIRST.map((r) => `${r} ${suit}`);

/** Every card, scrambled deterministically. */
const scrambled = DECK.map((c) => c.id).sort((a, b) => ((a * 37) % 55) - ((b * 37) % 55));

describe('displayOrder', () => {
  it('before trump: each color high to low, then Tiger, Bull, Bear', () => {
    expect(names(displayOrder(scrambled, null))).toEqual([
      ...color('red'),
      ...color('yellow'),
      ...color('black'),
      ...color('green'),
      'Tiger',
      'Bull',
      'Bear',
    ]);
  });

  it.each(SUITS)(
    'with %s trump: Tiger and trump first, other colors, then Bull and Bear',
    (trump) => {
      const others = SUITS.filter((s) => s !== trump);
      expect(names(displayOrder(scrambled, trump))).toEqual([
        'Tiger',
        ...color(trump),
        ...others.flatMap(color),
        'Bull',
        'Bear',
      ]);
    },
  );

  it('ranks by the rank table, so the 11 sits between the $15k and the $10k', () => {
    const red = DECK.filter((c) => c.kind === 'suit' && c.suit === 'red').map((c) => c.id);
    expect(names(displayOrder(red, 'green')).slice(0, 5)).toEqual([
      '$40k red',
      '$30k red',
      '$15k red',
      '11 red',
      '$10k red',
    ]);
  });

  it('only reorders: the same cards come back, and the input is untouched', () => {
    const hand = [BEAR_ID, 3, TIGER_ID, 40, 17, BULL_ID, 29];
    const copy = [...hand];
    const shown = displayOrder(hand, 'black');
    expect([...shown].sort((a, b) => a - b)).toEqual([...hand].sort((a, b) => a - b));
    expect(hand).toEqual(copy);
  });
});

describe('displayGroup', () => {
  it('puts the Tiger with trump once named, and with the specials before', () => {
    expect(displayGroup(TIGER_ID, 'yellow')).toBe('yellow');
    expect(displayGroup(TIGER_ID, null)).toBe('special');
    expect(displayGroup(BULL_ID, 'yellow')).toBe('special');
    expect(displayGroup(0, 'yellow')).toBe('red');
  });
});
