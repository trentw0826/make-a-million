import {
  type Card,
  type CardId,
  isMoney,
  isNumberCard,
  isTrump,
  moneyValue,
  rankIndex,
  type Suit,
} from '@mam/engine';
import { suitLengths } from './analysis';
import { bestTrump } from './evaluate';

/**
 * Choose three discards from a 16-card hand. Number cards go first (the rules demand it);
 * among them, prefer non-trump cards from short suits (to create voids) and low ranks.
 * If Money must go, shed the cheapest, non-trump, short-suit Money.
 */
export function chooseDiscards(cards: readonly Card[], required: number): CardId[] {
  const trump = bestTrump(cards).suit;
  const lengths = suitLengths(cards);

  const numbers = cards
    .filter((c) => isNumberCard(c))
    .sort((x, y) => discardScore(y, trump, lengths) - discardScore(x, trump, lengths));
  const chosen = numbers.slice(0, required).map((c) => c.id);

  if (chosen.length < 3) {
    const money = cards
      .filter((c) => isMoney(c))
      .sort((x, y) => moneyDiscardScore(y, trump, lengths) - moneyDiscardScore(x, trump, lengths));
    for (const c of money) {
      if (chosen.length === 3) break;
      chosen.push(c.id);
    }
  }
  return chosen;
}

function discardScore(card: Card, trump: Suit, lengths: Record<Suit, number>): number {
  if (card.kind !== 'suit') return -1000;
  let score = 0;
  if (!isTrump(card, trump)) score += 100;
  score += (13 - lengths[card.suit]) * 3;
  score += 12 - rankIndex(card);
  return score;
}

function moneyDiscardScore(card: Card, trump: Suit, lengths: Record<Suit, number>): number {
  if (card.kind !== 'suit') return -1000;
  let score = 0;
  if (!isTrump(card, trump)) score += 100;
  score += (13 - lengths[card.suit]) * 2;
  score += (40_000 - moneyValue(card)) / 1000;
  return score;
}
