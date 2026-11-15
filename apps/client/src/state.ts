import type { GameEvent, Seat, TableView, TrickPlay } from '@mam/engine';
import type { RoomView, ServerMessage } from '@mam/protocol';
import { money, nameOf, SUIT_NAMES } from './format';

export type Connection = 'idle' | 'connecting' | 'open' | 'reconnecting';

export interface Toast {
  readonly id: number;
  readonly kind: 'error' | 'info';
  readonly text: string;
}

export interface LogEntry {
  readonly id: number;
  readonly text: string;
}

export interface CompletedTrick {
  readonly plays: readonly TrickPlay[];
  readonly winner: Seat;
}

export interface ClientState {
  readonly connection: Connection;
  readonly me: { readonly playerId: string; readonly name: string } | null;
  readonly room: RoomView | null;
  readonly view: TableView | null;
  readonly log: readonly LogEntry[];
  /** Cards of the trick in progress, built from events so the finished trick can linger. */
  readonly trickPlays: readonly TrickPlay[];
  readonly completedTrick: CompletedTrick | null;
  readonly toast: Toast | null;
  /** The How to play dialog. */
  readonly helpOpen: boolean;
}

export const initialState: ClientState = {
  connection: 'idle',
  me: null,
  room: null,
  view: null,
  log: [],
  trickPlays: [],
  completedTrick: null,
  toast: null,
  helpOpen: false,
};

export type Msg =
  | { readonly kind: 'status'; readonly status: Connection }
  | { readonly kind: 'server'; readonly message: ServerMessage }
  | { readonly kind: 'toast'; readonly toast: Omit<Toast, 'id'> | null }
  | { readonly kind: 'clearCompletedTrick' }
  | { readonly kind: 'help'; readonly open: boolean };

let nextId = 1;
const MAX_LOG = 40;

export function reduce(state: ClientState, msg: Msg): ClientState {
  switch (msg.kind) {
    case 'status':
      return { ...state, connection: msg.status };
    case 'toast':
      return { ...state, toast: msg.toast ? { ...msg.toast, id: nextId++ } : null };
    case 'clearCompletedTrick':
      return { ...state, completedTrick: null };
    case 'help':
      return { ...state, helpOpen: msg.open };
    case 'server':
      return onServer(state, msg.message);
  }
}

function onServer(state: ClientState, message: ServerMessage): ClientState {
  switch (message.type) {
    case 'welcome':
      return { ...state, me: { playerId: message.playerId, name: message.name } };
    case 'room': {
      const lobby = message.room.phase === 'lobby';
      return {
        ...state,
        room: message.room,
        view: lobby ? null : state.view,
        log: lobby ? [] : state.log,
        trickPlays: lobby ? [] : state.trickPlays,
        completedTrick: lobby ? null : state.completedTrick,
      };
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
        room: null,
        view: null,
        log: [],
        trickPlays: [],
        completedTrick: null,
        toast: { id: nextId++, kind: 'info', text },
      };
    }
    case 'view':
      return { ...state, view: message.view };
    case 'events':
      return message.events.reduce(onEvent, state);
    case 'error':
      return { ...state, toast: { id: nextId++, kind: 'error', text: message.message } };
    case 'pong':
      return state;
  }
}

function onEvent(state: ClientState, event: GameEvent): ClientState {
  const name = (seat: Seat) => nameOf(state.room, seat);
  const push = (text: string): ClientState => ({
    ...state,
    log: [...state.log, { id: nextId++, text }].slice(-MAX_LOG),
  });

  switch (event.type) {
    case 'handStarted':
      return {
        ...push(
          event.redeals > 0
            ? `Misdeal — ${name(event.dealer)} deals again.`
            : `Hand ${event.handNumber}: ${name(event.dealer)} deals.`,
        ),
        trickPlays: [],
        completedTrick: null,
      };
    case 'misdealCalled':
      return push(`${name(event.seat)} calls a misdeal.`);
    case 'readyToBid':
      return state;
    case 'biddingStarted':
      return push(`${name(event.opener)} opens the bidding.`);
    case 'bid':
      return push(`${name(event.seat)} bids ${money(event.amount)}.`);
    case 'pass':
      return push(`${name(event.seat)} passes.`);
    case 'auctionWon':
      return push(
        `${name(event.seat)} takes the bid at ${money(event.amount)} and picks up the widow.`,
      );
    case 'handPassedOut':
      return push('Everyone passed — the hand is thrown in.');
    case 'discarded':
      return push(`${name(event.seat)} discards three cards.`);
    case 'trumpNamed':
      return push(`${name(event.seat)} names ${SUIT_NAMES[event.suit]} as trump.`);
    case 'cardPlayed': {
      // Plays are not written to the log: at a real table a played card is visible only
      // while its trick is on the felt (see "Table Visibility" in game-rules.md).
      const plays = state.trickPlays.some((p) => p.cardId === event.cardId)
        ? state.trickPlays
        : [...state.trickPlays, { seat: event.seat, cardId: event.cardId }];
      // A new lead sweeps the finished trick off the table so the lead is never hidden.
      return { ...state, trickPlays: plays, completedTrick: null };
    }
    case 'trickWon':
      return {
        ...push(`${name(event.seat)} takes trick ${event.trickIndex + 1}.`),
        completedTrick: { plays: state.trickPlays, winner: event.seat },
        trickPlays: [],
      };
    case 'handScored': {
      const r = event.result;
      return push(`${name(r.bidder)} ${r.made ? 'makes' : 'is set on'} the ${money(r.bid)} bid.`);
    }
    case 'gameOver':
      return push('Game over.');
  }
}
