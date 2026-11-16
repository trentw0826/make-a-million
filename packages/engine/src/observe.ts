import type { CardId, Suit } from './cards';
import { type LegalMoves, legalMoves } from './legal';
import type { Ruleset } from './ruleset';
import { type Seat, type Team, teamOf } from './seats';
import type { AuctionEntry, Contract, GameState, HandResult, Phase, Trick } from './state';

/**
 * Everything one seat is permitted to know (see docs/bot-standards.md). This is the only
 * input a bot receives. It contains the full public history of the current hand.
 */
export interface Observation {
  readonly seat: Seat;
  readonly team: Team;
  readonly ruleset: Ruleset;
  /** The step under way: the hand's own phase (bidding, playing, …), or 'game-over'. */
  readonly phase: Phase;
  readonly handNumber: number;
  readonly dealer: Seat;
  readonly redeals: number;
  readonly scores: readonly [number, number];
  readonly handHistory: readonly HandResult[];
  /** Own cards. */
  readonly hand: readonly CardId[];
  readonly handSizes: readonly [number, number, number, number];
  readonly misdeal: {
    /** Seats that have not confirmed they are ready to bid. Public. */
    readonly pending: readonly Seat[];
    /** Whether this seat may call a misdeal. Private to this seat. */
    readonly canCall: boolean;
  };
  readonly auction: readonly AuctionEntry[];
  readonly contract: Contract | null;
  readonly trump: Suit | null;
  /** The widow as picked up, and the discards; bidder only, otherwise null. */
  readonly widow: readonly CardId[] | null;
  readonly discards: readonly CardId[] | null;
  /** Completed tricks of this hand, with every card. Bots may remember these. */
  readonly tricks: readonly Trick[];
  readonly currentTrick: Trick | null;
  readonly turn: Seat | null;
  readonly legal: LegalMoves;
  readonly result: HandResult | null;
  /** Seats that have not yet confirmed the hand result. Public. */
  readonly continuePending: readonly Seat[];
  readonly winner: Team | null;
}

/**
 * What a human is shown: the Observation minus anything not visible at a physical table
 * (see "Table Visibility" in docs/game-rules.md). Completed tricks are face-down piles,
 * so only their counts remain.
 */
export interface TableView extends Omit<Observation, 'tricks' | 'handHistory'> {
  readonly trickCounts: readonly [number, number];
  /** Score-sheet lines only: the cards of past hands are gone from the table. */
  readonly handHistory: readonly ScoreLine[];
}

/** One line of the paper score sheet: a HandResult without its tricks. */
export type ScoreLine = Omit<HandResult, 'tricks'>;

export function observe(state: GameState, seat: Seat): Observation {
  const hand = state.hand;
  const isBidder = hand?.contract?.bidder === seat;
  return {
    seat,
    team: teamOf(seat),
    ruleset: state.ruleset,
    // GameState.phase stays 'misdeal-window' for the whole of a hand; the hand tracks its
    // own progress.
    phase: state.phase === 'game-over' ? 'game-over' : (hand?.phase ?? state.phase),
    handNumber: hand?.handNumber ?? 0,
    dealer: state.dealer,
    redeals: hand?.redeals ?? 0,
    scores: state.scores,
    handHistory: state.handHistory,
    hand: hand ? hand.hands[seat] : [],
    handSizes: hand
      ? [hand.hands[0].length, hand.hands[1].length, hand.hands[2].length, hand.hands[3].length]
      : [0, 0, 0, 0],
    misdeal: {
      pending: hand?.misdeal.pending ?? [],
      canCall: hand?.misdeal.eligible.includes(seat) ?? false,
    },
    auction: hand?.auction.entries ?? [],
    contract: hand?.contract ?? null,
    trump: hand?.trump ?? null,
    widow: isBidder && hand ? hand.widow : null,
    discards: isBidder && hand ? hand.discards : null,
    tricks: hand?.tricks ?? [],
    currentTrick: hand?.currentTrick ?? null,
    turn: hand?.turn ?? null,
    legal: legalMoves(state, seat),
    result: hand?.result ?? null,
    continuePending: hand?.continuePending ?? [],
    winner: state.winner,
  };
}

export function tableView(obs: Observation): TableView {
  const { tricks, handHistory, ...rest } = obs;
  const counts: [number, number] = [0, 0];
  for (const t of tricks) {
    if (t.winner !== null) counts[teamOf(t.winner)] += 1;
  }
  // The just-finished hand's tricks stay in `result` while it is being counted; once the
  // next hand is dealt they are gone, as at a real table.
  const sheet = handHistory.map(({ tricks: _cards, ...line }) => line);
  return { ...rest, handHistory: sheet, trickCounts: counts };
}
