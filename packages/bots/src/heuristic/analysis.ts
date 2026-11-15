import {
  type Card,
  type CardId,
  cardById,
  DECK,
  effectiveSuit,
  isTrump,
  moneyValue,
  nextSeat,
  type Observation,
  partnerOf,
  rankIndex,
  type Seat,
  type Suit,
  type SuitCard,
  type Trick,
} from '@mam/engine';

/**
 * Knowledge derived from an Observation: what has been seen, what is still out there,
 * and who has shown a void. Everything here follows from permitted information only.
 */
export interface Analysis {
  readonly obs: Observation;
  readonly me: Seat;
  readonly partner: Seat;
  readonly opponents: readonly [Seat, Seat];
  readonly trump: Suit | null;
  readonly myCards: readonly Card[];
  /** Cards played so far this hand, in completed tricks or the current one. */
  readonly played: ReadonlySet<CardId>;
  /** Cards I have not seen: not mine, not played, not my discards. */
  readonly unseen: readonly Card[];
  /** Suits each seat has failed to follow. */
  readonly voids: ReadonlyMap<Seat, ReadonlySet<Suit>>;
}

export function analyze(obs: Observation): Analysis {
  const me = obs.seat;
  const partner = partnerOf(me);
  const trump = obs.trump;

  const played = new Set<CardId>();
  const allTricks: Trick[] = [...obs.tricks];
  if (obs.currentTrick) allTricks.push(obs.currentTrick);
  for (const trick of allTricks) for (const play of trick.plays) played.add(play.cardId);

  const known = new Set<CardId>([...obs.hand, ...played, ...(obs.discards ?? [])]);
  const unseen = DECK.filter((card) => !known.has(card.id));

  const voids = new Map<Seat, Set<Suit>>();
  for (const seat of [0, 1, 2, 3] as const) voids.set(seat, new Set());
  for (const trick of allTricks) {
    let suit: Suit | null = null;
    for (const play of trick.plays) {
      const eff = effectiveSuit(cardById(play.cardId), trump);
      if (suit !== null && eff !== suit) voids.get(play.seat)?.add(suit);
      if (suit === null && eff !== null) suit = eff;
    }
  }

  return {
    obs,
    me,
    partner,
    opponents: [nextSeat(me), nextSeat(partner)],
    trump,
    myCards: obs.hand.map(cardById),
    played,
    unseen,
    voids,
  };
}

export function unseenInSuit(a: Analysis, suit: Suit): SuitCard[] {
  return a.unseen.filter((c): c is SuitCard => c.kind === 'suit' && c.suit === suit);
}

export function tigerUnseen(a: Analysis): boolean {
  return a.unseen.some((c) => c.kind === 'tiger');
}

/**
 * Whether no unseen card could outrank this one in its own suit. For a trump card this
 * includes the Tiger. Ignores the possibility of being trumped when leading a side suit.
 */
export function isBoss(a: Analysis, card: Card): boolean {
  if (card.kind === 'tiger') return true;
  if (card.kind !== 'suit') return false;
  const higher = unseenInSuit(a, card.suit).some((u) => rankIndex(u) > rankIndex(card));
  if (higher) return false;
  if (a.trump !== null && card.suit === a.trump) return !tigerUnseen(a);
  return true;
}

/** A strength score comparable across any two cards within one trick. */
export function trickScore(card: Card, trickSuit: Suit, trump: Suit): number {
  if (card.kind === 'tiger') return 1000;
  if (card.kind !== 'suit') return -1;
  if (isTrump(card, trump)) return 100 + rankIndex(card);
  if (card.suit === trickSuit) return rankIndex(card);
  return -1;
}

export function beats(candidate: Card, winner: Card, trickSuit: Suit, trump: Suit): boolean {
  return trickScore(candidate, trickSuit, trump) > trickScore(winner, trickSuit, trump);
}

export function faceMoney(trick: Trick): number {
  return trick.plays.reduce((sum, p) => sum + moneyValue(cardById(p.cardId)), 0);
}

export function suitLengths(cards: readonly Card[]): Record<Suit, number> {
  const lengths: Record<Suit, number> = { red: 0, yellow: 0, black: 0, green: 0 };
  for (const card of cards) if (card.kind === 'suit') lengths[card.suit] += 1;
  return lengths;
}

export function lowestByRank(cards: readonly SuitCard[]): SuitCard | undefined {
  return [...cards].sort((x, y) => rankIndex(x) - rankIndex(y))[0];
}

export function highestByRank(cards: readonly SuitCard[]): SuitCard | undefined {
  return [...cards].sort((x, y) => rankIndex(y) - rankIndex(x))[0];
}

export function suitCards(cards: readonly Card[]): SuitCard[] {
  return cards.filter((c): c is SuitCard => c.kind === 'suit');
}
