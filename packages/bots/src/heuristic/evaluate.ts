import { type Card, isTrump, SUITS, type Suit, TOTAL_MONEY } from '@mam/engine';
import { suitLengths } from './analysis';

/** Average tricks a seat takes in a hand: 13 / 4. */
const AVERAGE_TRICKS = 3.25;

/**
 * A rough count of the tricks this hand should take with `trump` named. Tuned by hand;
 * the point is relative ordering between trump choices and a bid ceiling, not accuracy.
 */
export function expectedTricks(cards: readonly Card[], trump: Suit): number {
  const trumps = cards.filter((c) => isTrump(c, trump));
  const trumpRanks = new Set(trumps.flatMap((c) => (c.kind === 'suit' ? [c.rank] : [])));
  const lengths = suitLengths(cards);

  let tricks = 0;
  if (trumps.some((c) => c.kind === 'tiger')) tricks += 1;
  if (trumpRanks.has('40k')) tricks += 1;
  if (trumpRanks.has('30k')) tricks += trumpRanks.has('40k') ? 0.9 : 0.6;
  if (trumpRanks.has('15k')) tricks += trumpRanks.has('30k') ? 0.8 : 0.4;
  if (trumpRanks.has('11')) tricks += 0.3;
  tricks += Math.max(0, trumps.length - 4) * 0.6;

  for (const suit of SUITS) {
    if (suit === trump) continue;
    const len = lengths[suit];
    const ranks = new Set(
      cards.flatMap((c) => (c.kind === 'suit' && c.suit === suit ? [c.rank] : [])),
    );
    if (ranks.has('40k')) tricks += len >= 3 ? 0.9 : 0.7;
    if (ranks.has('30k')) tricks += ranks.has('40k') ? 0.6 : 0.3;
    if (ranks.has('15k') && ranks.has('30k') && ranks.has('40k')) tricks += 0.5;
    if (len === 0 && trumps.length >= 4) tricks += 0.5;
    else if (len === 1 && trumps.length >= 4) tricks += 0.2;
  }
  return tricks;
}

/** Estimated money the team captures if this seat names `trump`. */
export function expectedCapture(cards: readonly Card[], trump: Suit): number {
  const tricks = expectedTricks(cards, trump);
  const share = clamp(0.5 + ((tricks - AVERAGE_TRICKS) / 13) * 1.1, 0.1, 0.95);
  return share * TOTAL_MONEY;
}

export function bestTrump(cards: readonly Card[]): { suit: Suit; value: number } {
  let best: { suit: Suit; value: number } | null = null;
  for (const suit of SUITS) {
    const value = expectedCapture(cards, suit);
    if (!best || value > best.value) best = { suit, value };
  }
  return best as { suit: Suit; value: number };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
