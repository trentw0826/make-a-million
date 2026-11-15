import type { CardId, Suit } from './cards';

export type Action =
  | { readonly type: 'callMisdeal' }
  /** "I'm ready to bid": declines to call a misdeal (or confirms when not eligible). */
  | { readonly type: 'declineMisdeal' }
  | { readonly type: 'bid'; readonly amount: number }
  | { readonly type: 'pass' }
  | { readonly type: 'discard'; readonly cardIds: readonly CardId[] }
  | { readonly type: 'nameTrump'; readonly suit: Suit }
  | { readonly type: 'playCard'; readonly cardId: CardId }
  /** Advance from the hand-complete screen to the next deal. */
  | { readonly type: 'continue' };

export type ActionType = Action['type'];
