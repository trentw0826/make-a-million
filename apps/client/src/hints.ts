import {
  type AuctionEntry,
  type CardId,
  cardById,
  cardLabel,
  effectiveSuit,
  isBullOrBear,
  partnerOf,
  type Seat,
  type Suit,
  type TableView,
  type TrickPlay,
} from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { nameOf, SUIT_NAMES, shortMoney } from './format';

/** The color a trick must follow: set by its first card that is not the Bull or Bear. */
export function trickSuit(plays: readonly TrickPlay[], trump: Suit | null): Suit | null {
  for (const play of plays) {
    const card = cardById(play.cardId);
    if (!isBullOrBear(card)) return effectiveSuit(card, trump);
  }
  return null;
}

/** "Ann", "Ann and Bot 2", "Ann, Bot 2 and Cid". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** True when the table is waiting on this seat. Confirming the hand result has its own countdown, so it doesn't count. */
export function isMyTurn(view: TableView): boolean {
  return view.legal.kind !== 'none' && view.legal.kind !== 'continue';
}

/** What the table is waiting for, and on whom, when it is not this seat's move. */
export function waitingText(view: TableView, room: RoomView): string {
  const who = (seat: Seat) => nameOf(room, seat);
  const bidder = view.contract ? who(view.contract.bidder) : 'The bidder';
  switch (view.phase) {
    case 'misdeal-window': {
      const others = view.misdeal.pending.filter((s) => s !== view.seat).map(who);
      return others.length > 0 ? `Waiting for ${listNames(others)} to look at their hands…` : '';
    }
    case 'bidding':
      return view.turn === null ? '' : `Waiting for ${who(view.turn)} to bid…`;
    case 'discarding':
      return `${bidder} picks up the widow and discards…`;
    case 'naming-trump':
      return `${bidder} is naming trump…`;
    case 'playing':
      return view.turn === null ? '' : `Waiting for ${who(view.turn)} to play…`;
    default:
      return '';
  }
}

/** What the card about to be played must do. Meant for this seat's turn to play. */
export function playHint(view: TableView): string {
  const trick = view.currentTrick;
  if (!trick || trick.plays.length === 0) return 'Your lead.';
  const suit = trick.suit;
  if (suit === null) return 'No color yet: play any card.';
  const name = `${SUIT_NAMES[suit]}${suit === view.trump ? ' (trump)' : ''}`;
  const canFollow = view.hand.some((id) => effectiveSuit(cardById(id), view.trump) === suit);
  return canFollow ? `Follow ${name}.` : `No ${name}: play any card.`;
}

/** Why a greyed-out card can't be chosen right now, for its tooltip. */
export function blockedReason(id: CardId, view: TableView): string | undefined {
  const card = cardById(id);
  const legal = view.legal;
  if (legal.kind === 'discard') {
    if (legal.forbiddenIds.includes(id)) return `The ${cardLabel(card)} can't be discarded.`;
    return 'Number cards must be discarded before Money.';
  }
  if (legal.kind !== 'play' || legal.cardIds.includes(id)) return undefined;
  const trick = view.currentTrick;
  if (!trick || trick.plays.length === 0) {
    return isBullOrBear(card)
      ? `The ${cardLabel(card)} can be led only when nothing else is left in your hand.`
      : undefined;
  }
  if (trick.suit === null) return undefined;
  const suit = SUIT_NAMES[trick.suit];
  return card.kind === 'tiger'
    ? `The Tiger can't be played to ${suit} while you can follow it.`
    : `You must follow ${suit}.`;
}

export type Bid = Extract<AuctionEntry, { kind: 'bid' }>;

/** The standing high bid of an auction. */
export function highBid(auction: readonly AuctionEntry[]): Bid | null {
  for (let i = auction.length - 1; i >= 0; i--) {
    const entry = auction[i];
    if (entry?.kind === 'bid') return entry;
  }
  return null;
}

export type ChipKind = 'ready' | 'bid' | 'high' | 'pass';

export interface SeatChip {
  readonly text: string;
  readonly kind: ChipKind;
}

/**
 * What a seat has said, shown beside it: "Ready" once it has looked at its hand, then its
 * latest call in the auction. All of it is spoken aloud at a real table.
 */
export function seatChip(view: TableView, seat: Seat): SeatChip | null {
  if (view.phase === 'misdeal-window') {
    return view.misdeal.pending.includes(seat) ? null : { text: 'Ready', kind: 'ready' };
  }
  if (view.phase !== 'bidding') return null;
  const last = view.auction.findLast((e) => e.seat === seat);
  if (!last) return null;
  if (last.kind === 'pass') return { text: 'Pass', kind: 'pass' };
  const high = highBid(view.auction);
  return { text: shortMoney(last.amount), kind: high?.seat === seat ? 'high' : 'bid' };
}

/** "you", "your partner" or "opponent", as `seat` is seen from `me`. */
export function relation(me: Seat, seat: Seat): string {
  if (seat === me) return 'you';
  return seat === partnerOf(me) ? 'your partner' : 'opponent';
}
