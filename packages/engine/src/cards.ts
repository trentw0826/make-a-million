/**
 * Card definitions. Rank order is a fixed table; card *value* (money) must never be used
 * to compare ranks, because the 11 sits between the $15k and the $10k.
 */

export const SUITS = ['red', 'yellow', 'black', 'green'] as const;
export type Suit = (typeof SUITS)[number];

/** Ranks in ascending order of strength. There is no 6. */
export const RANKS = [
  '1',
  '2',
  '3',
  '4',
  '5k',
  '7',
  '8',
  '9',
  '10k',
  '11',
  '15k',
  '30k',
  '40k',
] as const;
export type Rank = (typeof RANKS)[number];

export const MONEY_VALUE: Readonly<Record<Rank, number>> = {
  '1': 0,
  '2': 0,
  '3': 0,
  '4': 0,
  '5k': 5_000,
  '7': 0,
  '8': 0,
  '9': 0,
  '10k': 10_000,
  '11': 0,
  '15k': 15_000,
  '30k': 30_000,
  '40k': 40_000,
};

/** Total money in the deck: 4 suits × ($40k + $30k + $15k + $10k + $5k). */
export const TOTAL_MONEY = 400_000;

export type CardId = number;

export interface SuitCard {
  readonly id: CardId;
  readonly kind: 'suit';
  readonly suit: Suit;
  readonly rank: Rank;
}

export type SpecialKind = 'tiger' | 'bull' | 'bear';

export interface SpecialCard {
  readonly id: CardId;
  readonly kind: SpecialKind;
}

export type Card = SuitCard | SpecialCard;

export const TIGER_ID: CardId = 52;
export const BULL_ID: CardId = 53;
export const BEAR_ID: CardId = 54;
export const DECK_SIZE = 55;
export const HAND_SIZE = 13;
export const WIDOW_SIZE = 3;

function buildDeck(): readonly Card[] {
  const cards: Card[] = [];
  for (const [s, suit] of SUITS.entries()) {
    for (const [r, rank] of RANKS.entries()) {
      cards.push({ id: s * RANKS.length + r, kind: 'suit', suit, rank });
    }
  }
  cards.push({ id: TIGER_ID, kind: 'tiger' });
  cards.push({ id: BULL_ID, kind: 'bull' });
  cards.push({ id: BEAR_ID, kind: 'bear' });
  return cards;
}

/** The full 55-card deck, indexed by card id. */
export const DECK: readonly Card[] = buildDeck();

export function cardById(id: CardId): Card {
  const card = DECK[id];
  if (!card) throw new RangeError(`invalid card id ${id}`);
  return card;
}

export function isSuitCard(card: Card): card is SuitCard {
  return card.kind === 'suit';
}

export function isSpecial(card: Card): card is SpecialCard {
  return card.kind !== 'suit';
}

/** Bull or Bear: the two cards with no suit and no rank. */
export function isBullOrBear(card: Card): boolean {
  return card.kind === 'bull' || card.kind === 'bear';
}

export function moneyValue(card: Card): number {
  return isSuitCard(card) ? MONEY_VALUE[card.rank] : 0;
}

export function isMoney(card: Card): boolean {
  return moneyValue(card) > 0;
}

/** A plain number card: a suit card with no money value. */
export function isNumberCard(card: Card): boolean {
  return isSuitCard(card) && MONEY_VALUE[card.rank] === 0;
}

/** Position in the rank table; higher beats lower within a suit. */
export function rankIndex(card: SuitCard): number {
  return RANKS.indexOf(card.rank);
}

/**
 * The suit a card counts as for following and winning. The Tiger counts as trump.
 * Bull and Bear have no suit.
 */
export function effectiveSuit(card: Card, trump: Suit | null): Suit | null {
  if (card.kind === 'suit') return card.suit;
  if (card.kind === 'tiger') return trump;
  return null;
}

export function isTrump(card: Card, trump: Suit): boolean {
  return card.kind === 'tiger' || (card.kind === 'suit' && card.suit === trump);
}

export function sumMoney(ids: readonly CardId[]): number {
  let total = 0;
  for (const id of ids) total += moneyValue(cardById(id));
  return total;
}

/** Stable display order: by suit, then ascending rank, specials last. Equals id order. */
export function sortHand(ids: readonly CardId[]): CardId[] {
  return [...ids].sort((a, b) => a - b);
}

/** Short label such as "$40k", "11", "Tiger". */
export function cardLabel(card: Card): string {
  if (card.kind === 'suit') return card.rank.endsWith('k') ? `$${card.rank}` : card.rank;
  if (card.kind === 'tiger') return 'Tiger';
  return card.kind === 'bull' ? 'Bull' : 'Bear';
}
