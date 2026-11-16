import { type Card, cardById, isTrump, moneyValue, rankIndex, type Suit } from './cards';
import { nextSeat, type Seat } from './seats';
import type { Trick, TrickModifier, TrickPlay, TrickSummary } from './state';

/** Who leads the first trick of a hand: the player to the left of the highest bidder. */
export function openingLeader(bidder: Seat): Seat {
  return nextSeat(bidder);
}

/**
 * How strongly a card competes in a trick of the given suit: the Tiger above everything,
 * then trumps by rank, then cards of the trick suit by rank. Anything else cannot win.
 */
export function trickStrength(card: Card, trickSuit: Suit | null, trump: Suit): number | null {
  if (card.kind === 'tiger') return 1000;
  if (card.kind !== 'suit') return null;
  if (isTrump(card, trump)) return 100 + rankIndex(card);
  if (trickSuit !== null && card.suit === trickSuit) return rankIndex(card);
  return null;
}

/** The play currently winning a (possibly incomplete) trick, or null if no card can win yet. */
export function currentWinner(trick: Trick, trump: Suit): TrickPlay | null {
  let best: { play: TrickPlay; strength: number } | null = null;
  for (const play of trick.plays) {
    const strength = trickStrength(cardById(play.cardId), trick.suit, trump);
    if (strength !== null && (best === null || strength > best.strength)) {
      best = { play, strength };
    }
  }
  return best?.play ?? null;
}

/**
 * The winner of a complete trick: the highest trump if any trump (or the Tiger) was played,
 * otherwise the highest card of the trick suit.
 */
export function trickWinner(trick: Trick, trump: Suit): Seat {
  if (trick.plays.length !== 4) throw new Error('trick is not complete');
  const winner = currentWinner(trick, trump);
  if (!winner) throw new Error('trick has no winning card');
  return winner.seat;
}

/** The last-played of Bull/Bear decides the modifier. */
export function trickModifier(trick: Trick): TrickModifier {
  let modifier: TrickModifier = 'none';
  for (const play of trick.plays) {
    const kind = cardById(play.cardId).kind;
    if (kind === 'bull') modifier = 'bull';
    else if (kind === 'bear') modifier = 'bear';
  }
  return modifier;
}

export function applyModifier(money: number, modifier: TrickModifier): number {
  switch (modifier) {
    case 'bull':
      return money * 2;
    case 'bear':
      return 0;
    default:
      return money;
  }
}

export function summarizeTrick(trick: Trick): TrickSummary {
  if (trick.winner === null) throw new Error('trick has no winner');
  const cardIds = trick.plays.map((p) => p.cardId);
  const money = cardIds.reduce((sum, id) => sum + moneyValue(cardById(id)), 0);
  const modifier = trickModifier(trick);
  return {
    leader: trick.leader,
    winner: trick.winner,
    cardIds,
    money,
    modifier,
    value: applyModifier(money, modifier),
  };
}
