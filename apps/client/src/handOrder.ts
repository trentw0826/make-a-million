import { type CardId, cardById, RANKS, rankIndex, SUITS, type Suit } from '@mam/engine';

/** Where a card sorts: its group first, then higher ranks first within the group. */
function sortKey(id: CardId, trump: Suit | null): readonly [number, number] {
  const card = cardById(id);
  const colors: readonly Suit[] = trump ? [trump, ...SUITS.filter((s) => s !== trump)] : SUITS;
  switch (card.kind) {
    case 'suit':
      return [colors.indexOf(card.suit), -rankIndex(card)];
    case 'tiger':
      // With trump named it heads the trump color, above its $40k; until then it waits
      // with the other specials.
      return trump ? [0, -RANKS.length] : [SUITS.length, 0];
    case 'bull':
      return [SUITS.length + 1, 0];
    case 'bear':
      return [SUITS.length + 2, 0];
  }
}

/**
 * The order the hand is shown in, left to right. Once trump is named: the Tiger and the
 * trump color, high to low, then the other colors in their usual order, then Bull and Bear.
 * Before that: each color high to low, then Tiger, Bull, Bear. Ranks come from the engine's
 * table, never from Money value, because the 11 sits between the $15k and the $10k.
 */
export function displayOrder(hand: readonly CardId[], trump: Suit | null): CardId[] {
  return [...hand].sort((a, b) => {
    const [groupA, rankA] = sortKey(a, trump);
    const [groupB, rankB] = sortKey(b, trump);
    return groupA - groupB || rankA - rankB;
  });
}

/** The group a card is shown in (its color, or 'special'); the hand leaves a gap between groups. */
export function displayGroup(id: CardId, trump: Suit | null): Suit | 'special' {
  const card = cardById(id);
  if (card.kind === 'suit') return card.suit;
  if (card.kind === 'tiger' && trump) return trump;
  return 'special';
}
