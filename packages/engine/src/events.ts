import type { CardId, Suit } from './cards';
import type { Seat, Team } from './seats';
import type { HandResult } from './state';

/**
 * Public events emitted by applyAction. They never carry hidden information, so they
 * can be broadcast to every seat.
 */
export type GameEvent =
  | {
      readonly type: 'handStarted';
      readonly handNumber: number;
      readonly dealer: Seat;
      readonly redeals: number;
    }
  | { readonly type: 'misdealCalled'; readonly seat: Seat }
  | { readonly type: 'readyToBid'; readonly seat: Seat }
  | { readonly type: 'biddingStarted'; readonly opener: Seat }
  | { readonly type: 'bid'; readonly seat: Seat; readonly amount: number }
  | { readonly type: 'pass'; readonly seat: Seat }
  | { readonly type: 'auctionWon'; readonly seat: Seat; readonly amount: number }
  | { readonly type: 'handPassedOut' }
  | { readonly type: 'discarded'; readonly seat: Seat }
  | { readonly type: 'trumpNamed'; readonly seat: Seat; readonly suit: Suit }
  | { readonly type: 'cardPlayed'; readonly seat: Seat; readonly cardId: CardId }
  | { readonly type: 'trickWon'; readonly seat: Seat; readonly trickIndex: number }
  | { readonly type: 'handScored'; readonly result: HandResult }
  | { readonly type: 'readyForNextHand'; readonly seat: Seat }
  | { readonly type: 'gameOver'; readonly winner: Team };
