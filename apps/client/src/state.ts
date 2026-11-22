import type {
  Action,
  AuctionEntry,
  GameEvent,
  HandResult,
  Seat,
  TableView,
  TrickPlay,
} from '@mam/engine';
import type { AnalysisDecision, MoveLabel, RoomView, ServerMessage } from '@mam/protocol';
import { nameOf, SUIT_NAMES, shortMoney, signedShortMoney, teamLabel } from './format';

export type Connection = 'idle' | 'connecting' | 'open' | 'reconnecting';

export interface Toast {
  readonly id: number;
  readonly kind: 'error' | 'info';
  readonly text: string;
}

/** How a log line is shown: 'good' for a bid made, 'bad' for a set. */
export type Tone = 'info' | 'good' | 'bad';

export interface LogEntry {
  readonly id: number;
  /** The hand the line belongs to; the log is grouped by hand. */
  readonly hand: number;
  readonly text: string;
  readonly tone: Tone;
}

export interface CompletedTrick {
  readonly plays: readonly TrickPlay[];
  readonly winner: Seat;
  /** 'hold': lying where it was played; 'sweep': sliding off toward the winner. */
  readonly stage: 'hold' | 'sweep';
}

export interface ClientState {
  readonly connection: Connection;
  readonly me: { readonly playerId: string; readonly name: string } | null;
  readonly room: RoomView | null;
  readonly view: TableView | null;
  readonly log: readonly LogEntry[];
  /** Bids and passes of the auction in progress; the log gets them as one line at the end. */
  readonly auction: readonly AuctionEntry[];
  /** Cards of the trick in progress, built from events so the finished trick can linger. */
  readonly trickPlays: readonly TrickPlay[];
  readonly completedTrick: CompletedTrick | null;
  readonly toast: Toast | null;
  /** The How to play dialog. */
  readonly helpOpen: boolean;
  /** While the hand result is up: when, on this clock, the next hand is dealt regardless. */
  readonly resultDeadline: ResultDeadline | null;
  /** Solo: the game jumped (undo or redo); the next view replaces the table and its log. */
  readonly rewound: 'undo' | 'redo' | null;
  /**
   * Solo, with the analysis on: the side's chance of winning (kept between positions, so the
   * bar moves rather than blinks) and the values of your decision in the position on the
   * table (null until they arrive, and again with every new view).
   */
  readonly analysis: {
    readonly winChance: number | null;
    readonly decision: AnalysisDecision | null;
  };
  /** Solo, with the analysis on: how your last move compared with the best. */
  readonly review: Review | null;
}

export interface Review {
  readonly id: number;
  readonly label: MoveLabel;
  readonly lossK: number;
  readonly best: Action;
}

const NO_ANALYSIS = { winChance: null, decision: null } as const;

export interface ResultDeadline {
  /** `Date.now()` time at which the countdown reaches zero. */
  readonly endsAt: number;
  readonly totalMs: number;
}

export const initialState: ClientState = {
  connection: 'idle',
  me: null,
  room: null,
  view: null,
  log: [],
  auction: [],
  trickPlays: [],
  completedTrick: null,
  toast: null,
  helpOpen: false,
  resultDeadline: null,
  rewound: null,
  analysis: NO_ANALYSIS,
  review: null,
};

export type Msg =
  | { readonly kind: 'status'; readonly status: Connection }
  | { readonly kind: 'server'; readonly message: ServerMessage }
  | { readonly kind: 'toast'; readonly toast: Omit<Toast, 'id'> | null }
  /** Moves the finished trick on: hold → sweep → gone. */
  | { readonly kind: 'advanceCompletedTrick' }
  | { readonly kind: 'help'; readonly open: boolean };

let nextId = 1;
/** The log keeps this many hands, newest last. */
export const LOG_HANDS = 6;

/** Nothing on the felt and no auction under way: how each hand begins. */
const CLEAR_TABLE = { auction: [], trickPlays: [], completedTrick: null } as const;

export function reduce(state: ClientState, msg: Msg): ClientState {
  switch (msg.kind) {
    case 'status':
      return { ...state, connection: msg.status };
    case 'toast':
      return { ...state, toast: msg.toast ? { ...msg.toast, id: nextId++ } : null };
    case 'advanceCompletedTrick':
      return { ...state, completedTrick: advance(state.completedTrick) };
    case 'help':
      return { ...state, helpOpen: msg.open };
    case 'server':
      return onServer(state, msg.message);
  }
}

function advance(trick: CompletedTrick | null): CompletedTrick | null {
  if (!trick) return null;
  return trick.stage === 'hold' ? { ...trick, stage: 'sweep' } : null;
}

function onServer(state: ClientState, message: ServerMessage): ClientState {
  switch (message.type) {
    case 'welcome':
      // Sent on every (re)connection. Events missed while away are gone, so the felt is
      // rebuilt from the next view rather than from stale cards.
      return { ...state, ...CLEAR_TABLE, me: { playerId: message.playerId, name: message.name } };
    case 'room': {
      // With the analysis off, nothing of it is kept.
      const off = message.room.analysis ? {} : { analysis: NO_ANALYSIS, review: null };
      return message.room.phase === 'lobby'
        ? { ...state, ...CLEAR_TABLE, ...off, room: message.room, view: null, log: [] }
        : { ...state, ...off, room: message.room };
    }
    case 'left': {
      const text =
        message.reason === 'closed'
          ? 'The room has closed.'
          : message.reason === 'kicked'
            ? 'The game started without a seat for you.'
            : 'You left the room.';
      return {
        ...state,
        ...CLEAR_TABLE,
        room: null,
        view: null,
        log: [],
        analysis: NO_ANALYSIS,
        review: null,
        toast: { id: nextId++, kind: 'info', text },
      };
    }
    case 'view': {
      // The server sends each view just before the events that explain it. After a trick's
      // last card the view already holds the next, empty trick: keep the cards on the felt
      // until the events arrive. A view holding more cards than we have (a reload or a
      // reconnect) is adopted as it is.
      const live = message.view.currentTrick?.plays ?? [];
      const trickPlays = live.length >= state.trickPlays.length ? live : state.trickPlays;
      // The server sends time left rather than a clock time, so skew between clocks is moot.
      const timer = message.resultTimer;
      const resultDeadline = timer
        ? { endsAt: Date.now() + timer.remainingMs, totalMs: timer.totalMs }
        : null;
      // A new position: the values of the last decision no longer apply.
      const analysis = { winChance: state.analysis.winChance, decision: null };
      const next = { ...state, view: message.view, trickPlays, resultDeadline, analysis };
      return state.rewound ? afterRewind(next, message.view, state.rewound) : next;
    }
    case 'rewound':
      // No events explain the jump, so nothing on the felt carries over, nor the review of a
      // move that may have been taken back.
      return { ...state, ...CLEAR_TABLE, rewound: message.by, review: null };
    case 'analysis':
      return {
        ...state,
        analysis: { winChance: message.winChance, decision: message.decision },
      };
    case 'moveReview':
      return {
        ...state,
        review: { id: nextId++, label: message.label, lossK: message.lossK, best: message.best },
      };
    case 'events':
      return message.events.reduce(onEvent, state);
    case 'error':
      return { ...state, toast: { id: nextId++, kind: 'error', text: message.message } };
    case 'pong':
      return state;
  }
}

/** Appends a line, dropping hands older than the last LOG_HANDS. */
function withLine(state: ClientState, entry: LogEntry): ClientState {
  const oldest = entry.hand - LOG_HANDS + 1;
  const kept =
    state.log[0] && state.log[0].hand < oldest
      ? state.log.filter((e) => e.hand >= oldest)
      : state.log;
  return { ...state, log: [...kept, entry] };
}

function onEvent(state: ClientState, event: GameEvent): ClientState {
  const name = (seat: Seat) => nameOf(state.room, seat);
  // The view for this change has already arrived, so it names the hand.
  const hand = state.view?.handNumber ?? state.log.at(-1)?.hand ?? 0;
  const push = (text: string, tone: Tone = 'info', inHand = hand): ClientState =>
    withLine(state, { id: nextId++, hand: inHand, text, tone });

  switch (event.type) {
    case 'handStarted':
      return {
        ...push(
          event.redeals > 0 ? `${name(event.dealer)} deals again.` : `${name(event.dealer)} deals.`,
          'info',
          event.handNumber,
        ),
        ...CLEAR_TABLE,
      };
    case 'misdealCalled':
      return push(`${name(event.seat)} calls a misdeal.`);
    case 'readyForNextHand':
    case 'biddingStarted':
    case 'discarded':
      // Shown live on the table (seat chips, waiting text); not worth a log line.
      return state;
    case 'bid':
      return {
        ...state,
        auction: [...state.auction, { seat: event.seat, kind: 'bid', amount: event.amount }],
      };
    case 'pass':
      return { ...state, auction: [...state.auction, { seat: event.seat, kind: 'pass' }] };
    case 'auctionWon': {
      // After a reload the buffer misses the early calls; the view has all of them.
      const heard =
        state.view && state.view.auction.length > state.auction.length
          ? state.view.auction
          : state.auction;
      return { ...push(auctionText(state, heard, event.seat, event.amount)), auction: [] };
    }
    case 'handPassedOut':
      return { ...push('Everyone passed. The hand is thrown in.'), auction: [] };
    case 'trumpNamed':
      return push(`${name(event.seat)} names ${SUIT_NAMES[event.suit]} trump.`);
    case 'cardPlayed': {
      // Plays are never logged: at a real table a played card is visible only while its
      // trick is on the felt (see "Table Visibility" in game-rules.md).
      const plays = state.trickPlays.some((p) => p.cardId === event.cardId)
        ? state.trickPlays
        : [...state.trickPlays, { seat: event.seat, cardId: event.cardId }];
      // A new lead sends the finished trick on its way, so the lead is never hidden.
      const done = state.completedTrick;
      return {
        ...state,
        trickPlays: plays,
        completedTrick: done?.stage === 'hold' ? advance(done) : done,
      };
    }
    case 'trickWon':
      // Not logged either: the trick counts are on the contract bar.
      return {
        ...state,
        completedTrick: { plays: state.trickPlays, winner: event.seat, stage: 'hold' },
        trickPlays: [],
      };
    case 'handScored': {
      const line = scoredLine(state, event.result);
      return push(line.text, line.tone, event.result.handNumber);
    }
    case 'gameOver':
      return push(`Game over. ${teamLabel(state.room, event.winner)} win.`, 'good');
  }
}

function auctionText(
  state: ClientState,
  calls: readonly AuctionEntry[],
  seat: Seat,
  amount: number,
): string {
  const name = (s: Seat) => nameOf(state.room, s);
  const said = calls
    .map((e) => `${name(e.seat)} ${e.kind === 'bid' ? shortMoney(e.amount) : 'pass'}`)
    .join(' · ');
  const won = `${name(seat)} at ${shortMoney(amount)}`;
  return said ? `Auction: ${said} → ${won}.` : `Auction → ${won}.`;
}

function scoredLine(state: ClientState, r: HandResult): { text: string; tone: Tone } {
  const side = teamLabel(state.room, r.biddingTeam);
  const delta = signedShortMoney(r.delta[r.biddingTeam]);
  return r.made
    ? { text: `${side} made the ${shortMoney(r.bid)} bid (${delta}).`, tone: 'good' }
    : { text: `${side} were set on the ${shortMoney(r.bid)} bid (${delta}).`, tone: 'bad' };
}

/**
 * After an undo or redo: earlier hands' lines stand, and the hand on the table is written
 * again from the view (the deal, the auction, trump and the result, as far as they have
 * gone), then a line says what happened.
 */
function afterRewind(state: ClientState, view: TableView, by: 'undo' | 'redo'): ClientState {
  const hand = view.handNumber;
  const name = (s: Seat) => nameOf(state.room, s);
  let next: ClientState = {
    ...state,
    rewound: null,
    log: state.log.filter((e) => e.hand < hand),
  };
  const line = (text: string, tone: Tone = 'info') => {
    next = withLine(next, { id: nextId++, hand, text, tone });
  };
  line(view.redeals > 0 ? `${name(view.dealer)} deals again.` : `${name(view.dealer)} deals.`);
  if (view.contract) {
    line(auctionText(state, view.auction, view.contract.bidder, view.contract.amount));
    if (view.trump) line(`${name(view.contract.bidder)} names ${SUIT_NAMES[view.trump]} trump.`);
  } else {
    // The auction still under way is shown on the felt, from these calls.
    next = { ...next, auction: view.auction };
  }
  if (view.result) {
    const scored = scoredLine(state, view.result);
    line(scored.text, scored.tone);
  }
  line(by === 'undo' ? 'You took back a move.' : 'You replayed a move.');
  return next;
}
