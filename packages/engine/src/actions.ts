import type { CardId, Suit } from './cards';

export type Action =
  /** On a first turn in the auction, with Money at or under the threshold: re-deal. */
  | { readonly type: 'callMisdeal' }
  | { readonly type: 'bid'; readonly amount: number }
  | { readonly type: 'pass' }
  | { readonly type: 'discard'; readonly cardIds: readonly CardId[] }
  | { readonly type: 'nameTrump'; readonly suit: Suit }
  | { readonly type: 'playCard'; readonly cardId: CardId }
  /** Advance from the hand-complete screen to the next deal. */
  | { readonly type: 'continue' };

export type ActionType = Action['type'];
