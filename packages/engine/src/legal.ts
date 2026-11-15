import type { Action } from './actions';
import {
  type CardId,
  cardById,
  effectiveSuit,
  isBullOrBear,
  isNumberCard,
  isSpecial,
  SUITS,
  type Suit,
} from './cards';
import { type RuleError, ruleError } from './errors';
import type { Seat } from './seats';
import type { GameState, Trick } from './state';

/**
 * What a seat may do right now. Bids are unbounded, so this is a description rather
 * than a list of actions. `validate` is the single authority on legality.
 */
export type LegalMoves =
  | { readonly kind: 'none' }
  | { readonly kind: 'misdeal'; readonly canCall: boolean }
  | {
      readonly kind: 'bid';
      readonly minBid: number;
      readonly step: number;
      readonly canPass: boolean;
    }
  | {
      readonly kind: 'discard';
      /** Exactly this many of the three discards must be plain number cards. */
      readonly requiredNumberCards: number;
      readonly forbiddenIds: readonly CardId[];
    }
  | { readonly kind: 'trump'; readonly suits: readonly Suit[] }
  | { readonly kind: 'play'; readonly cardIds: readonly CardId[] }
  | { readonly kind: 'continue' };

const NONE: LegalMoves = { kind: 'none' };

/** Cards from `hand` that may legally be played into `trick`. */
export function playableCards(
  hand: readonly CardId[],
  trick: Trick | null,
  trump: Suit | null,
): CardId[] {
  const cards = hand.map(cardById);
  if (!trick || trick.plays.length === 0) {
    // Leading: Bull/Bear may be led only when nothing else is held.
    const nonSpecialLeads = cards.filter((c) => !isBullOrBear(c));
    return (nonSpecialLeads.length > 0 ? nonSpecialLeads : cards).map((c) => c.id);
  }
  if (trick.suit === null) {
    // Only Bull/Bear so far: the trick has no suit yet, anything goes.
    return [...hand];
  }
  const following = cards.filter((c) => effectiveSuit(c, trump) === trick.suit);
  return (following.length > 0 ? following : cards).map((c) => c.id);
}

export function requiredNumberDiscards(hand: readonly CardId[]): number {
  const numberCards = hand.filter((id) => isNumberCard(cardById(id))).length;
  return Math.min(3, numberCards);
}

export function legalMoves(state: GameState, seat: Seat): LegalMoves {
  const hand = state.hand;
  if (state.phase === 'game-over' || !hand) return NONE;

  switch (hand.phase) {
    case 'misdeal-window':
      if (!hand.misdeal.pending.includes(seat)) return NONE;
      return { kind: 'misdeal', canCall: hand.misdeal.eligible.includes(seat) };

    case 'bidding': {
      if (hand.auction.turn !== seat) return NONE;
      const { bidding } = state.ruleset;
      const high = hand.auction.highBid;
      const minBid = high ? high.amount + bidding.raiseIncrement : bidding.minOpeningBid;
      const mustOpen = high === null && bidding.openerMustBid;
      return { kind: 'bid', minBid, step: bidding.bidStep, canPass: !mustOpen };
    }

    case 'discarding': {
      if (hand.contract?.bidder !== seat) return NONE;
      const own = hand.hands[seat];
      return {
        kind: 'discard',
        requiredNumberCards: requiredNumberDiscards(own),
        forbiddenIds: own.filter((id) => isSpecial(cardById(id))),
      };
    }

    case 'naming-trump':
      if (hand.contract?.bidder !== seat) return NONE;
      return { kind: 'trump', suits: SUITS };

    case 'playing':
      if (hand.turn !== seat) return NONE;
      return {
        kind: 'play',
        cardIds: playableCards(hand.hands[seat], hand.currentTrick, hand.trump),
      };

    case 'hand-complete':
      return hand.continuePending.includes(seat) ? { kind: 'continue' } : NONE;
  }
}

/** Returns null when `action` is legal for `seat` in `state`. */
export function validate(state: GameState, seat: Seat, action: Action): RuleError | null {
  if (state.phase === 'game-over') return ruleError('GAME_OVER', 'the game is over');
  const moves = legalMoves(state, seat);

  switch (action.type) {
    case 'callMisdeal':
    case 'declineMisdeal': {
      if (moves.kind !== 'misdeal') return wrongTurnOrPhase(state, moves, 'misdeal');
      if (action.type === 'callMisdeal' && !moves.canCall) {
        return ruleError('NOT_ELIGIBLE_FOR_MISDEAL', 'your hand is above the misdeal threshold');
      }
      return null;
    }

    case 'bid': {
      if (moves.kind !== 'bid') return wrongTurnOrPhase(state, moves, 'bidding');
      if (!Number.isInteger(action.amount) || action.amount % moves.step !== 0) {
        return ruleError('BID_NOT_MULTIPLE', `bids must be multiples of ${moves.step}`);
      }
      if (action.amount < moves.minBid) {
        return ruleError('BID_TOO_LOW', `the minimum bid is ${moves.minBid}`);
      }
      return null;
    }

    case 'pass': {
      if (moves.kind !== 'bid') return wrongTurnOrPhase(state, moves, 'bidding');
      if (!moves.canPass) return ruleError('MUST_OPEN', 'the opener must bid');
      return null;
    }

    case 'discard': {
      if (moves.kind !== 'discard') return wrongTurnOrPhase(state, moves, 'discarding');
      const ids = action.cardIds;
      if (ids.length !== 3) return ruleError('DISCARD_COUNT', 'discard exactly three cards');
      if (new Set(ids).size !== 3)
        return ruleError('DISCARD_DUPLICATE', 'discards must be distinct');
      const own = state.hand?.hands[seat] ?? [];
      for (const id of ids) {
        if (!own.includes(id)) return ruleError('DISCARD_NOT_IN_HAND', `card ${id} is not in hand`);
        if (moves.forbiddenIds.includes(id)) {
          return ruleError('DISCARD_SPECIAL', 'the Tiger, Bull and Bear may never be discarded');
        }
      }
      const numberCount = ids.filter((id) => isNumberCard(cardById(id))).length;
      if (numberCount < moves.requiredNumberCards) {
        return ruleError(
          'DISCARD_MONEY_WHILE_NUMBERS',
          'Money cards may not be discarded while number cards are available',
        );
      }
      return null;
    }

    case 'nameTrump': {
      if (moves.kind !== 'trump') return wrongTurnOrPhase(state, moves, 'naming trump');
      if (!moves.suits.includes(action.suit)) return ruleError('INVALID_TRUMP', 'not a suit');
      return null;
    }

    case 'playCard': {
      if (moves.kind !== 'play') return wrongTurnOrPhase(state, moves, 'play');
      const own = state.hand?.hands[seat] ?? [];
      if (!own.includes(action.cardId)) return ruleError('CARD_NOT_IN_HAND', 'card is not in hand');
      if (!moves.cardIds.includes(action.cardId)) {
        const trick = state.hand?.currentTrick;
        if (!trick || trick.plays.length === 0) {
          return ruleError(
            'CANNOT_LEAD_SPECIAL',
            'the Bull and Bear may be led only as last cards',
          );
        }
        return ruleError('MUST_FOLLOW_SUIT', 'you must follow the suit led');
      }
      return null;
    }

    case 'continue':
      if (moves.kind !== 'continue') return wrongTurnOrPhase(state, moves, 'hand-complete');
      return null;

    default:
      return ruleError('INVALID_ACTION', 'unknown action');
  }
}

function wrongTurnOrPhase(state: GameState, moves: LegalMoves, wanted: string): RuleError {
  const phase = state.hand?.phase ?? state.phase;
  if (moves.kind === 'none' && phaseMatches(phase, wanted)) {
    return ruleError('NOT_YOUR_TURN', 'it is not your turn');
  }
  return ruleError('WRONG_PHASE', `cannot ${wanted} during ${phase}`);
}

function phaseMatches(phase: string, wanted: string): boolean {
  switch (wanted) {
    case 'misdeal':
      return phase === 'misdeal-window';
    case 'bidding':
      return phase === 'bidding';
    case 'discarding':
      return phase === 'discarding';
    case 'naming trump':
      return phase === 'naming-trump';
    case 'play':
      return phase === 'playing';
    default:
      return phase === wanted;
  }
}
