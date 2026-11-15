import { cardById, isTrump, moneyValue, rankIndex, type Suit } from './cards';
import type { Seat } from './seats';
import type { Trick, TrickModifier, TrickSummary } from './state';

/**
 * The winner of a complete trick: the highest trump if any trump (or the Tiger) was played,
 * otherwise the highest card of the trick suit.
 */
export function trickWinner(trick: Trick, trump: Suit): Seat {
  if (trick.plays.length !== 4) throw new Error('trick is not complete');
  let best: { seat: Seat; score: number } | null = null;
  for (const play of trick.plays) {
    const card = cardById(play.cardId);
    let score: number | null = null;
    if (card.kind === 'tiger') {
      score = 1000;
    } else if (card.kind === 'suit') {
      if (isTrump(card, trump)) score = 100 + rankIndex(card);
      else if (card.suit === trick.suit) score = rankIndex(card);
    }
    if (score !== null && (best === null || score > best.score)) {
      best = { seat: play.seat, score };
    }
  }
  if (!best) throw new Error('trick has no winning card');
  return best.seat;
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
