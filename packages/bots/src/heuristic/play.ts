import {
  type Card,
  type CardId,
  cardById,
  currentWinner,
  isBullOrBear,
  isMoney,
  isNumberCard,
  isTrump,
  moneyValue,
  type Rng,
  rankIndex,
  type Suit,
  type SuitCard,
  type Trick,
  teamOf,
} from '@mam/engine';
import {
  type Analysis,
  beats,
  faceMoney,
  isBoss,
  lowestByRank,
  suitCards,
  suitLengths,
  tigerUnseen,
} from './analysis';

/** Money in a trick worth spending the Bull on when our side is winning it. */
const BULL_THRESHOLD = 30_000;
/** Money in a trick worth cancelling with the Bear when we cannot win it. */
const BEAR_THRESHOLD = 25_000;
/** Below this, don't spend a winner on an opponent's trick unless we play last. */
const WORTH_WINNING = 10_000;

export function choosePlay(a: Analysis, legalIds: readonly CardId[], rng: Rng): CardId {
  const trick = a.obs.currentTrick;
  const trump = a.trump;
  if (!trick || trump === null) throw new Error('choosePlay outside play');
  const legal = legalIds.map(cardById);
  if (legal.length === 1) return (legal[0] as Card).id;

  const winning = currentWinner(trick, trump);
  if (!winning) return lead(a, legal, trump, rng);
  return follow(a, legal, trick, trump, winning.seat, cardById(winning.cardId));
}

// ---------------------------------------------------------------------------

function lead(a: Analysis, legal: readonly Card[], trump: Suit, rng: Rng): CardId {
  const playable = legal.filter((c) => !isBullOrBear(c));
  if (playable.length === 0) return rng.pick(legal).id;

  const sideBosses = suitCards(playable).filter((c) => !isTrump(c, trump) && isBoss(a, c));
  if (sideBosses.length > 0) {
    // Cash a sure winner; the richest first.
    return best(sideBosses, (c) => moneyValue(c) * 100 + rankIndex(c)).id;
  }

  const myTrumps = playable.filter((c) => isTrump(c, trump));
  const weHoldContract = a.obs.contract !== null && teamOf(a.obs.contract.bidder) === a.obs.team;
  const opponentsMayHoldTrumps =
    a.unseen.some((c) => c.kind === 'suit' && c.suit === trump) || tigerUnseen(a);
  if (weHoldContract && myTrumps.length >= 4 && opponentsMayHoldTrumps) {
    const bossTrumps = suitCards(myTrumps).filter((c) => isBoss(a, c));
    if (bossTrumps.length > 0) return best(bossTrumps, (c) => rankIndex(c)).id;
    const tiger = myTrumps.find((c) => c.kind === 'tiger');
    if (tiger && myTrumps.length >= 5) return tiger.id;
  }

  // Safe lead: the lowest number card from our longest side suit.
  const sideNumbers = suitCards(playable).filter((c) => isNumberCard(c) && !isTrump(c, trump));
  if (sideNumbers.length > 0) {
    const lengths = suitLengths(a.myCards);
    const longest = best(sideNumbers, (c) => lengths[c.suit] * 100 - rankIndex(c));
    return longest.id;
  }

  const trumpNumbers = suitCards(myTrumps).filter((c) => isNumberCard(c));
  const lowTrump = lowestByRank(trumpNumbers);
  if (lowTrump) return lowTrump.id;

  // Only Money (and perhaps the Tiger) left: lead the cheapest non-trump Money.
  const money = suitCards(playable).filter((c) => isMoney(c));
  if (money.length > 0) {
    return best(money, (c) => (isTrump(c, trump) ? -1000 : 0) - moneyValue(c)).id;
  }
  return (playable[0] as Card).id;
}

function follow(
  a: Analysis,
  legal: readonly Card[],
  trick: Trick,
  trump: Suit,
  winnerSeat: 0 | 1 | 2 | 3,
  winnerCard: Card,
): CardId {
  const trickSuit = trick.suit ?? trump;
  const partnerWinning = winnerSeat === a.partner;
  const amLast = trick.plays.length === 3;
  const money = faceMoney(trick);
  const bull = legal.find((c) => c.kind === 'bull');
  const bear = legal.find((c) => c.kind === 'bear');
  const plain = legal.filter((c) => !isBullOrBear(c));

  if (partnerWinning) {
    const secure = amLast || isBoss(a, winnerCard);
    if (secure) {
      if (bull && money >= BULL_THRESHOLD) return bull.id;
      const feed = richest(plain);
      if (feed) return feed.id;
    }
    return cheapest(plain, trump) ?? (legal[0] as Card).id;
  }

  // An opponent is winning.
  const winners = plain.filter((c) => beats(c, winnerCard, trickSuit, trump));
  if (winners.length > 0) {
    const worthIt = money >= WORTH_WINNING || amLast || winners.some((c) => isBoss(a, c));
    if (worthIt) {
      // Cheapest card that wins: a plain follow before a trump, a trump before the Tiger.
      const chosen = best(winners, (c) => -winCost(c, trickSuit, trump, money));
      return chosen.id;
    }
  }
  if (bear && money >= BEAR_THRESHOLD) return bear.id;
  return cheapest(plain, trump) ?? (legal[0] as Card).id;
}

// ---------------------------------------------------------------------------

function winCost(card: Card, trickSuit: Suit, trump: Suit, money: number): number {
  if (card.kind === 'tiger') return money >= 40_000 ? 60 : 500;
  if (card.kind !== 'suit') return 1000;
  const ruff = trickSuit !== trump && isTrump(card, trump) ? 50 : 0;
  return ruff + rankIndex(card);
}

/** The least valuable card to throw away: low number cards first, then low Money, keep trumps. */
function cheapest(cards: readonly Card[], trump: Suit): CardId | undefined {
  const suit = suitCards(cards);
  if (suit.length === 0) return cards[0]?.id;
  return best(suit, (c) => {
    let cost = rankIndex(c);
    if (isMoney(c)) cost += 20 + moneyValue(c) / 1000;
    if (isTrump(c, trump)) cost += 15;
    return -cost;
  }).id;
}

/** The most valuable Money card to feed into a trick our side is taking. */
function richest(cards: readonly Card[]): SuitCard | undefined {
  const money = suitCards(cards).filter((c) => isMoney(c));
  if (money.length === 0) return undefined;
  return best(money, (c) => moneyValue(c));
}

function best<T>(items: readonly T[], score: (item: T) => number): T {
  let top = items[0] as T;
  let topScore = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const s = score(item);
    if (s > topScore) {
      top = item;
      topScore = s;
    }
  }
  return top;
}
