import {
  createGame,
  type GameEvent,
  type HandResult,
  observe,
  type Seat,
  type TableView,
  type TrickPlay,
  tableView,
} from '@mam/engine';
import type { RoomView, ServerMessage } from '@mam/protocol';
import { describe, expect, it } from 'vitest';
import { type ClientState, initialState, LOG_HANDS, type Msg, reduce } from '../src/state';

const room: RoomView = {
  code: 'ABC123',
  phase: 'playing',
  hostId: 'p1',
  seats: [
    { kind: 'human', playerId: 'p1', name: 'Ann', connected: true, botControlled: false },
    { kind: 'bot', name: 'Bot 2', difficulty: 'easy' },
    { kind: 'human', playerId: 'p3', name: 'Cid', connected: false, botControlled: true },
    { kind: 'bot', name: 'Bot 4', difficulty: 'normal' },
  ],
  yourSeat: 0,
  solo: false,
  analysis: false,
  canUndo: false,
  canRedo: false,
};

const welcome: ServerMessage = { type: 'welcome', playerId: 'p1', token: 't', name: 'Ann' };
const server = (message: ServerMessage): Msg => ({ kind: 'server', message });
const events = (...list: GameEvent[]): Msg => server({ type: 'events', events: list });
const play = (seat: Seat, cardId: number): GameEvent => ({ type: 'cardPlayed', seat, cardId });
const texts = (s: ClientState) => s.log.map((e) => e.text);
const seated = () => reduce(initialState, server({ type: 'room', room }));

const dealt = tableView(observe(createGame({ seed: 'ui' }), 0));
/** A view in the middle of play whose current trick holds `plays`. */
function midTrick(plays: TrickPlay[]): Msg {
  const view: TableView = {
    ...dealt,
    phase: 'playing',
    currentTrick: { leader: plays[0]?.seat ?? 0, plays, suit: null, winner: null },
  };
  return server({ type: 'view', view });
}

function result(handNumber: number, made: boolean): HandResult {
  return {
    handNumber,
    dealer: 0,
    redeals: 0,
    bidder: 1,
    bid: 185_000,
    trump: 'green',
    biddingTeam: 1,
    captured: [190_000, made ? 210_000 : 150_000],
    made,
    delta: [190_000, made ? 210_000 : -185_000],
    scoresAfter: [0, 0],
    tricks: [],
  };
}

describe('client reducer', () => {
  it('records identity, room and view', () => {
    let s = reduce(initialState, server(welcome));
    s = reduce(s, server({ type: 'room', room }));
    s = reduce(s, server({ type: 'view', view: dealt }));
    expect(s.me).toEqual({ playerId: 'p1', name: 'Ann' });
    expect(s.room?.code).toBe('ABC123');
    expect(s.view?.hand).toHaveLength(13);
  });

  it('logs the whole auction as one line once it is won', () => {
    let s = reduce(
      seated(),
      events(
        { type: 'handStarted', handNumber: 1, dealer: 3, redeals: 0 },
        { type: 'biddingStarted', opener: 0 },
        { type: 'bid', seat: 0, amount: 175_000 },
        { type: 'bid', seat: 1, amount: 185_000 },
        { type: 'pass', seat: 2 },
        { type: 'pass', seat: 3 },
        { type: 'pass', seat: 0 },
      ),
    );
    expect(texts(s)).toEqual(['Bot 4 deals.']);
    expect(s.auction).toHaveLength(5);

    s = reduce(
      s,
      events(
        { type: 'auctionWon', seat: 1, amount: 185_000 },
        { type: 'discarded', seat: 1 },
        { type: 'trumpNamed', seat: 1, suit: 'green' },
      ),
    );
    expect(texts(s)).toEqual([
      'Bot 4 deals.',
      'Auction: Ann $175k · Bot 2 $185k · Cid pass · Bot 4 pass · Ann pass → Bot 2 at $185k.',
      'Bot 2 names Green trump.',
    ]);
    expect(s.log.every((e) => e.hand === 1)).toBe(true);
    expect(s.auction).toEqual([]);
  });

  it('notes a misdeal and the redeal', () => {
    const s = reduce(
      seated(),
      events(
        { type: 'handStarted', handNumber: 2, dealer: 0, redeals: 0 },
        { type: 'misdealCalled', seat: 2 },
        { type: 'handStarted', handNumber: 2, dealer: 0, redeals: 1 },
      ),
    );
    expect(texts(s)).toEqual(['Ann deals.', 'Cid calls a misdeal.', 'Ann deals again.']);
  });

  it('never logs plays or trick winners, and holds the finished trick before gathering it', () => {
    let s = reduce(
      seated(),
      events(play(1, 3), play(2, 4), play(3, 5), play(0, 12), {
        type: 'trickWon',
        seat: 0,
        trickIndex: 0,
      }),
    );
    expect(s.log).toEqual([]);
    expect(s.trickPlays).toEqual([]);
    expect(s.completedTrick).toEqual({
      winner: 0,
      stage: 'hold',
      plays: [
        { seat: 1, cardId: 3 },
        { seat: 2, cardId: 4 },
        { seat: 3, cardId: 5 },
        { seat: 0, cardId: 12 },
      ],
    });
    s = reduce(s, { kind: 'advanceCompletedTrick' });
    expect(s.completedTrick?.stage).toBe('sweep');
    s = reduce(s, { kind: 'advanceCompletedTrick' });
    expect(s.completedTrick).toBeNull();
  });

  it('a new lead sends the finished trick on its way and is shown at once', () => {
    let s = reduce(
      seated(),
      events(play(1, 3), play(2, 4), play(3, 5), play(0, 12), {
        type: 'trickWon',
        seat: 0,
        trickIndex: 0,
      }),
    );
    s = reduce(s, events(play(0, 20)));
    expect(s.completedTrick?.stage).toBe('sweep');
    expect(s.trickPlays).toEqual([{ seat: 0, cardId: 20 }]);
  });

  it('keeps the cards on the felt while the view runs ahead of the events', () => {
    let s = reduce(seated(), midTrick([{ seat: 1, cardId: 3 }]));
    expect(s.trickPlays).toEqual([{ seat: 1, cardId: 3 }]);
    s = reduce(s, events(play(1, 3), play(2, 4), play(3, 5)));
    expect(s.trickPlays).toHaveLength(3);
    // The last card's view already holds the next, empty trick; its events follow.
    s = reduce(s, midTrick([]));
    expect(s.trickPlays).toHaveLength(3);
    s = reduce(s, events(play(0, 12), { type: 'trickWon', seat: 0, trickIndex: 0 }));
    expect(s.completedTrick?.plays).toHaveLength(4);
    expect(s.trickPlays).toEqual([]);
  });

  it('rebuilds the trick from the view after reconnecting', () => {
    let s = reduce(seated(), events(play(1, 3), play(2, 4)));
    s = reduce(s, server(welcome));
    expect(s.trickPlays).toEqual([]);
    s = reduce(s, midTrick([{ seat: 3, cardId: 30 }]));
    expect(s.trickPlays).toEqual([{ seat: 3, cardId: 30 }]);
  });

  it('logs each result with its tone and keeps only the last hands', () => {
    let s = seated();
    for (let hand = 1; hand <= LOG_HANDS + 2; hand++) {
      s = reduce(
        s,
        events(
          { type: 'handStarted', handNumber: hand, dealer: 0, redeals: 0 },
          { type: 'handScored', result: result(hand, hand % 2 === 0) },
        ),
      );
    }
    expect([...new Set(s.log.map((e) => e.hand))]).toEqual([3, 4, 5, 6, 7, 8]);
    expect(s.log.at(-1)).toMatchObject({
      text: 'Bot 2 & Bot 4 made the $185k bid (+$210k).',
      tone: 'good',
    });
    expect(s.log.find((e) => e.hand === 7 && e.tone !== 'info')).toMatchObject({
      text: 'Bot 2 & Bot 4 were set on the $185k bid (−$185k).',
      tone: 'bad',
    });
  });

  it('clears the table when leaving and shows why', () => {
    let s = reduce(seated(), events(play(1, 3)));
    s = reduce(s, server({ type: 'left', reason: 'closed' }));
    expect(s.room).toBeNull();
    expect(s.trickPlays).toEqual([]);
    expect(s.toast).toMatchObject({ kind: 'info', text: 'The room has closed.' });
  });

  it('after an undo, clears the felt and writes the hand on the table again from the view', () => {
    // Hand 1 is done; in hand 2 a trick is under way when Ann takes her card back.
    let s = reduce(seated(), events({ type: 'handScored', result: result(1, true) }));
    const hand2: TableView = {
      ...dealt,
      handNumber: 2,
      dealer: 1,
      phase: 'playing',
      auction: [
        { seat: 2, kind: 'pass' },
        { seat: 3, kind: 'bid', amount: 150_000 },
        { seat: 0, kind: 'pass' },
        { seat: 1, kind: 'pass' },
      ],
      contract: { bidder: 3, amount: 150_000 },
      trump: 'red',
    };
    s = reduce(s, server({ type: 'view', view: hand2 }));
    s = reduce(s, events({ type: 'handStarted', handNumber: 2, dealer: 1, redeals: 0 }));
    s = reduce(s, events(play(0, 5), play(1, 6)));
    s = reduce(s, server({ type: 'rewound', by: 'undo' }));
    expect(s.trickPlays).toEqual([]);
    expect(s.completedTrick).toBeNull();
    s = reduce(s, server({ type: 'view', view: { ...hand2, currentTrick: null } }));
    expect(s.rewound).toBeNull();
    expect(s.trickPlays).toEqual([]);
    expect(texts(s)).toEqual([
      expect.stringContaining('made the $185k bid'),
      'Bot 2 deals.',
      'Auction: Cid pass · Bot 4 $150k · Ann pass · Bot 2 pass → Bot 4 at $150k.',
      'Bot 4 names Red trump.',
      'You took back a move.',
    ]);
    expect(s.log.map((e) => e.hand)).toEqual([1, 2, 2, 2, 2]);
  });

  it('says so after a redo', () => {
    let s = reduce(seated(), server({ type: 'rewound', by: 'redo' }));
    s = reduce(s, server({ type: 'view', view: dealt }));
    expect(texts(s).at(-1)).toBe('You replayed a move.');
  });

  it('turns server errors into toasts', () => {
    const s = reduce(
      initialState,
      server({
        type: 'error',
        code: 'ILLEGAL_ACTION',
        message: 'you must follow the suit led',
      }),
    );
    expect(s.toast).toMatchObject({ kind: 'error', text: 'you must follow the suit led' });
  });
});
