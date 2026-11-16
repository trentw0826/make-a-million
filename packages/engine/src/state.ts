import type { CardId, Suit } from './cards';
import type { RngState } from './rng';
import type { Ruleset } from './ruleset';
import type { Seat, Team } from './seats';

export type HandPhase =
  | 'misdeal-window'
  | 'bidding'
  | 'discarding'
  | 'naming-trump'
  | 'playing'
  | 'hand-complete';

export type Phase = HandPhase | 'game-over';

export type AuctionEntry =
  | { readonly seat: Seat; readonly kind: 'bid'; readonly amount: number }
  | { readonly seat: Seat; readonly kind: 'pass' };

export interface Contract {
  readonly bidder: Seat;
  readonly amount: number;
}

export interface TrickPlay {
  readonly seat: Seat;
  readonly cardId: CardId;
}

export interface Trick {
  readonly leader: Seat;
  readonly plays: readonly TrickPlay[];
  /** Set by the first card that is not the Bull or Bear (Tiger ⇒ trump). */
  readonly suit: Suit | null;
  /** Set once four cards have been played. */
  readonly winner: Seat | null;
}

export type TrickModifier = 'none' | 'bull' | 'bear';

/** A completed trick as it is counted at the end of the hand. */
export interface TrickSummary {
  readonly leader: Seat;
  readonly winner: Seat;
  readonly cardIds: readonly CardId[];
  /** Face value of the Money cards in the trick. */
  readonly money: number;
  /** The last-played of Bull/Bear decides the effect. */
  readonly modifier: TrickModifier;
  /** Money after the modifier: ×2 for Bull, 0 for Bear. */
  readonly value: number;
}

/** The score-sheet line for one hand. Public information. */
export interface HandResult {
  readonly handNumber: number;
  readonly dealer: Seat;
  readonly redeals: number;
  readonly bidder: Seat;
  readonly bid: number;
  readonly trump: Suit;
  readonly biddingTeam: Team;
  readonly captured: readonly [number, number];
  readonly made: boolean;
  readonly delta: readonly [number, number];
  readonly scoresAfter: readonly [number, number];
  readonly tricks: readonly TrickSummary[];
}

export interface MisdealWindow {
  /** Seats that have not yet confirmed they are ready to bid. */
  readonly pending: readonly Seat[];
  /** Seats whose Money is at or under the threshold. Private: never sent to other seats. */
  readonly eligible: readonly Seat[];
}

export interface Auction {
  readonly entries: readonly AuctionEntry[];
  readonly passed: readonly Seat[];
  readonly turn: Seat;
  readonly highBid: Contract | null;
}

export interface HandState {
  readonly handNumber: number;
  readonly dealer: Seat;
  /** Number of misdeals called before this deal. */
  readonly redeals: number;
  readonly phase: HandPhase;
  readonly hands: readonly [
    readonly CardId[],
    readonly CardId[],
    readonly CardId[],
    readonly CardId[],
  ];
  /**
   * The three cards left after the deal. Kept as a record for the whole hand; once the
   * auction ends they are also in the bidder's hand. Only the bidder may see them.
   */
  readonly widow: readonly CardId[];
  /** The bidder's three discards; out of play for the rest of the hand. */
  readonly discards: readonly CardId[];
  readonly misdeal: MisdealWindow;
  readonly auction: Auction;
  readonly contract: Contract | null;
  readonly trump: Suit | null;
  readonly tricks: readonly Trick[];
  readonly currentTrick: Trick | null;
  /** The seat that must act next; null when several seats act (misdeal window, hand-complete). */
  readonly turn: Seat | null;
  readonly result: HandResult | null;
  /**
   * Seats that have not yet confirmed the hand result. Filled when the hand is scored; the
   * next hand is dealt once it is empty.
   */
  readonly continuePending: readonly Seat[];
}

export interface GameState {
  readonly ruleset: Ruleset;
  readonly seed: string;
  readonly rngState: RngState;
  readonly phase: Phase;
  readonly scores: readonly [number, number];
  /** Scores the game started from, when not [0, 0] (a replayed single hand). */
  readonly initialScores?: readonly [number, number];
  /** Dealer of the hand in progress (or of the hand just finished). */
  readonly dealer: Seat;
  readonly handHistory: readonly HandResult[];
  readonly hand: HandState | null;
  readonly winner: Team | null;
}
