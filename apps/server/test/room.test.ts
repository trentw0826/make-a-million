import {
  ANALYSIS_DEFAULTS,
  type Analysis,
  type AnalysisOptions,
  analyze,
  fallbackAction,
} from '@mam/bots';
import { type Action, legalMoves, Rng } from '@mam/engine';
import type { AnalysisMode, ServerMessage } from '@mam/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AnalyzeSeat, decideInline } from '../src/botPool';
import { testConfig } from '../src/config';
import { silentLogger } from '../src/log';
import { Room } from '../src/room';

/** The analysis on small budgets: these tests check when it is sent, not how good it is. */
const CHEAP: AnalysisOptions = {
  ...ANALYSIS_DEFAULTS,
  search: {
    ...ANALYSIS_DEFAULTS.search,
    worlds: 4,
    exactWorlds: 4,
    nodes: 60_000,
    worldNodes: 15_000,
    bidWorlds: 16,
    screenWorlds: 6,
    refineWorlds: 2,
    refineTop: 2,
  },
  positionWorlds: 3,
  positionNodes: 40_000,
  positionWorldNodes: 15_000,
};
const analyzeCheap: AnalyzeSeat = (obs, seed, deadline, include) =>
  Promise.resolve(analyze(obs, Rng.fromSeed(seed), CHEAP, deadline, include ?? null));

interface Harness {
  room: Room;
  sent: Map<string, ServerMessage[]>;
  closed: Room[];
  last(playerId: string, type: ServerMessage['type']): ServerMessage | undefined;
  clear(): void;
}

function harness(overrides = {}, solo = false, analyzer: AnalyzeSeat = analyzeCheap): Harness {
  const sent = new Map<string, ServerMessage[]>();
  const closed: Room[] = [];
  const room = new Room(
    'ABC123',
    {
      config: testConfig({ graceMs: 60_000, roomIdleMs: 600_000, ...overrides }),
      log: silentLogger,
      send: (id, msg) => {
        const list = sent.get(id) ?? [];
        list.push(msg);
        sent.set(id, list);
      },
      onClosed: (r) => closed.push(r),
      decideBot: decideInline,
      analyze: analyzer,
    },
    solo,
  );
  return {
    room,
    sent,
    closed,
    last: (id, type) => [...(sent.get(id) ?? [])].reverse().find((m) => m.type === type),
    clear: () => sent.clear(),
  };
}

/** Lobby with host Ann in seat 0 and bots elsewhere, ready to start. */
function readyRoom(h: Harness): void {
  h.room.join('ann', 'Ann');
  h.room.sit('ann', 0);
  h.room.setBot('ann', 1, 'easy');
  h.room.setBot('ann', 2, 'normal');
  h.room.setBot('ann', 3, 'easy');
}

function humanActs(h: Harness, playerId: string): boolean {
  const view = h.last(playerId, 'view');
  if (view?.type !== 'view') return false;
  const action: Action | null = fallbackAction(view.view);
  if (!action) return false;
  const error = h.room.action(playerId, action);
  expect(error).toBeNull();
  return true;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('lobby', () => {
  it('starts every seat with a Normal bot that makes way for a player', () => {
    const h = harness();
    h.room.join('ann', 'Ann');
    h.room.join('bob', 'Bob');
    expect(h.room.hostId).toBe('ann');
    expect(h.room.seats).toEqual(
      [0, 1, 2, 3].map((s) => ({ kind: 'bot', difficulty: 'normal', name: `Bot ${s + 1}` })),
    );
    expect(h.room.sit('ann', 2)).toBeNull();
    expect(h.room.sit('bob', 2)).toEqual(expect.objectContaining({ code: 'SEAT_TAKEN' }));
    expect(h.room.sit('bob', 0)).toBeNull();
    expect(h.room.sit('ann', 1)).toBeNull(); // moving seats leaves a Normal bot behind
    expect(h.room.seats[2]).toEqual({ kind: 'bot', difficulty: 'normal', name: 'Bot 3' });
    expect(h.room.stand('bob')).toBeNull();
    expect(h.room.seats[0]).toEqual({ kind: 'bot', difficulty: 'normal', name: 'Bot 1' });
    const view = h.last('ann', 'room');
    expect(view).toMatchObject({ type: 'room', room: { yourSeat: 1, hostId: 'ann' } });
  });

  it('gives a lobby seat back to a bot when its player leaves', () => {
    const h = harness();
    h.room.join('ann', 'Ann');
    h.room.join('bob', 'Bob');
    h.room.sit('bob', 3);
    h.room.leave('bob');
    expect(h.room.seats[3]).toEqual({ kind: 'bot', difficulty: 'normal', name: 'Bot 4' });
  });

  it('lets only the host set bots and start, and needs a human seated', () => {
    const h = harness();
    h.room.join('ann', 'Ann');
    h.room.join('bob', 'Bob');
    expect(h.room.setBot('bob', 1, 'easy')).toEqual(expect.objectContaining({ code: 'NOT_HOST' }));
    expect(h.room.start('ann')).toEqual(expect.objectContaining({ code: 'ROOM_NOT_READY' }));
    expect(h.room.setBot('ann', 1, 'hard')).toBeNull();
    expect(h.room.seats[1]).toEqual({ kind: 'bot', difficulty: 'hard', name: 'Bot 2' });
    expect(h.room.setBot('ann', 2, 'expert')).toBeNull();
    expect(h.room.seats[2]).toEqual({ kind: 'bot', difficulty: 'expert', name: 'Bot 3' });
    h.room.sit('ann', 3);
    expect(h.room.setBot('ann', 3, 'easy')).toEqual(
      expect.objectContaining({ code: 'SEAT_TAKEN' }),
    );
    expect(h.room.start('ann')).toBeNull();
    expect(h.room.phase).toBe('playing');
    // Bob had no seat: no spectators, so he was sent out.
    expect(h.room.members.has('bob')).toBe(false);
    expect(h.last('bob', 'left')).toMatchObject({ reason: 'kicked' });
  });

  it('closes when the last member leaves, and passes the host role on', () => {
    const h = harness();
    h.room.join('ann', 'Ann');
    h.room.join('bob', 'Bob');
    h.room.leave('ann');
    expect(h.room.hostId).toBe('bob');
    h.room.leave('bob');
    expect(h.room.isClosed).toBe(true);
    expect(h.closed).toHaveLength(1);
  });

  it('ends the game when the last human at the table leaves', () => {
    const h = harness();
    readyRoom(h);
    h.room.start('ann');
    h.room.leave('ann');
    expect(h.last('ann', 'left')).toMatchObject({ reason: 'left' });
    expect(h.room.isClosed).toBe(true);
    expect(h.closed).toHaveLength(1);
  });

  it('plays on with a bot in the seat while another human is still at the table', () => {
    const h = harness();
    h.room.join('ann', 'Ann');
    h.room.join('bob', 'Bob');
    h.room.sit('ann', 0);
    h.room.sit('bob', 2);
    h.room.setBot('ann', 1, 'easy');
    h.room.setBot('ann', 3, 'easy');
    h.room.start('ann');
    // Bob has dropped but is inside his grace period: he may come back, so he counts.
    h.room.disconnect('bob');
    h.room.leave('ann');
    expect(h.room.isClosed).toBe(false);
    expect(h.room.seats[0]).toMatchObject({ kind: 'human', botControlled: true });
    // Once Bob's grace runs out a bot plays his seat too; if he then returns and leaves, he
    // was the last human at the table, and the game ends.
    vi.advanceTimersByTime(61_000);
    expect(h.room.seats[2]).toMatchObject({ botControlled: true });
    h.room.leave('bob');
    expect(h.room.isClosed).toBe(true);
  });

  it('removes a member who stays disconnected through the grace period', () => {
    const h = harness();
    h.room.join('ann', 'Ann');
    h.room.join('bob', 'Bob');
    h.room.sit('bob', 1);
    h.room.disconnect('bob');
    vi.advanceTimersByTime(59_000);
    expect(h.room.members.has('bob')).toBe(true);
    vi.advanceTimersByTime(2_000);
    expect(h.room.members.has('bob')).toBe(false);
    expect(h.room.seats[1]).toMatchObject({ kind: 'bot', difficulty: 'normal' });
  });
});

describe('play', () => {
  it('sends only the table view to the human and drives bots on timers', async () => {
    const h = harness();
    readyRoom(h);
    h.clear();
    expect(h.room.start('ann')).toBeNull();

    const view = h.last('ann', 'view');
    expect(view).toBeDefined();
    if (view?.type !== 'view') throw new Error('no view');
    expect(view.view.seat).toBe(0);
    expect(view.view.hand).toHaveLength(13);
    expect(Object.keys(view.view)).not.toContain('tricks');
    expect(view.view.trickCounts).toEqual([0, 0]);
    expect(view.view.tricksWon).toEqual([0, 0, 0, 0]);

    // Bidding opens with the deal: the bots call in turn after their fixed delays, and
    // every seat gets a turn before the auction can end, so it comes round to Ann.
    await vi.advanceTimersByTimeAsync(10);
    expect(h.room.game?.hand?.phase).toBe('bidding');
    expect(h.room.game?.hand?.turn).toBe(0);
  });

  it("waits each level's own reply time, Expert's by the kind of decision", async () => {
    const expert = { bid: 3_000, play: 1, discard: 1, trump: 1, continue: 1 };
    const h = harness({ botDelayMs: { easy: 1, normal: 1, hard: 1, expert } });
    readyRoom(h);
    h.room.setBot('ann', 1, 'expert');
    h.room.start('ann');
    // Seat 1 opens the auction; as an Expert it answers (a bid, a pass or a misdeal) only
    // after its time for a bid.
    expect(h.room.game?.hand?.turn).toBe(1);
    const dealt = h.room.game;
    await vi.advanceTimersByTimeAsync(2_900);
    expect(h.room.game).toBe(dealt);
    await vi.advanceTimersByTimeAsync(200);
    expect(h.room.game).not.toBe(dealt);
  });

  it('times a card differently from a bid when the level says so', async () => {
    const quick = { bid: 1, play: 700, discard: 1, trump: 1, continue: 1 };
    const h = harness({ botDelayMs: { easy: quick, normal: quick, hard: 1, expert: 1 } });
    readyRoom(h);
    h.room.start('ann');
    // On to the first card a bot is to play (Ann's own turns taken at once).
    for (let i = 0; i < 2_000; i++) {
      const game = h.room.game;
      if (game?.phase === 'playing' && game.hand?.turn !== 0) break;
      if (game?.hand?.turn === 0) humanActs(h, 'ann');
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(h.room.game?.phase).toBe('playing');
    const before = h.room.game;
    await vi.advanceTimersByTimeAsync(690);
    expect(h.room.game).toBe(before);
    await vi.advanceTimersByTimeAsync(20);
    expect(h.room.game).not.toBe(before);
  });

  it('plays a whole game with one human and three bots', async () => {
    const h = harness();
    readyRoom(h);
    h.room.start('ann');
    for (let i = 0; i < 5_000 && h.room.phase === 'playing'; i++) {
      await vi.advanceTimersByTimeAsync(5);
      if (h.room.phase === 'playing') humanActs(h, 'ann');
    }
    expect(h.room.phase).toBe('finished');
    expect(h.room.game?.winner).not.toBeNull();
    expect(h.last('ann', 'room')).toMatchObject({ room: { phase: 'finished' } });
  });

  it('rests after each trick before a bot leads the next one', async () => {
    const h = harness({ trickPauseMs: 10_000 });
    readyRoom(h);
    h.room.start('ann');
    // Play on until a bot has won a trick and must lead; the pause holds the table there.
    const waitingOnBotLead = () => {
      const hand = h.room.game?.hand;
      return (
        hand?.phase === 'playing' &&
        hand.tricks.length > 0 &&
        (hand.currentTrick?.plays.length ?? 0) === 0 &&
        hand.turn !== null &&
        hand.turn !== 0
      );
    };
    for (let i = 0; i < 2_000 && !waitingOnBotLead(); i++) {
      await vi.advanceTimersByTimeAsync(5);
      if (!waitingOnBotLead()) humanActs(h, 'ann');
    }
    expect(waitingOnBotLead()).toBe(true);
    const tricks = h.room.game?.hand?.tricks.length;
    const leader = h.room.game?.hand?.turn;

    // Nothing is played while the table rests (bots otherwise reply within 1 ms here)...
    await vi.advanceTimersByTimeAsync(9_000);
    expect(h.room.game?.hand?.currentTrick?.plays ?? []).toHaveLength(0);
    // ...then the bot leads, after its usual reply time (and the others follow).
    await vi.advanceTimersByTimeAsync(1_100);
    const next =
      h.room.game?.hand?.tricks.length === tricks
        ? h.room.game?.hand?.currentTrick
        : h.room.game?.hand?.tricks.at(-1);
    expect(next?.plays[0]?.seat).toBe(leader);
  });

  it('rejects illegal human actions and re-sends the view', async () => {
    const h = harness();
    readyRoom(h);
    h.room.start('ann');
    await vi.advanceTimersByTimeAsync(10);
    h.clear();
    const error = h.room.action('ann', { type: 'bid', amount: 175_000 });
    expect(error).toEqual(expect.objectContaining({ code: 'ILLEGAL_ACTION' }));
    expect(h.last('ann', 'view')).toBeDefined();
  });

  it('hands a disconnected seat to a bot after the grace period and back on reconnect', async () => {
    const h = harness();
    readyRoom(h);
    h.room.start('ann');
    await vi.advanceTimersByTimeAsync(10);
    const before = h.room.game;

    h.room.disconnect('ann');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.room.game).toBe(before); // the game waits for Ann
    expect(h.room.isBotControlled(0)).toBe(false);

    await vi.advanceTimersByTimeAsync(31_000);
    expect(h.room.isBotControlled(0)).toBe(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(h.room.game).not.toBe(before); // a bot has acted for her

    h.room.reconnect('ann');
    expect(h.room.isBotControlled(0)).toBe(false);
    const roomView = h.last('ann', 'room');
    expect(roomView).toMatchObject({
      room: { seats: expect.arrayContaining([expect.objectContaining({ botControlled: false })]) },
    });
    expect(h.last('ann', 'view')).toBeDefined();
  });

  it('closes the room after ten minutes with nobody connected', async () => {
    const h = harness();
    readyRoom(h);
    h.room.start('ann');
    h.room.disconnect('ann');
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    expect(h.room.isClosed).toBe(false);
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(h.room.isClosed).toBe(true);
  });

  it('lets the host start a new game with the same seats after the game ends', async () => {
    const h = harness();
    readyRoom(h);
    h.room.start('ann');
    for (let i = 0; i < 5_000 && h.room.phase === 'playing'; i++) {
      await vi.advanceTimersByTimeAsync(5);
      if (h.room.phase === 'playing') humanActs(h, 'ann');
    }
    expect(h.room.phase).toBe('finished');
    expect(h.room.playAgain('ann')).toBeNull();
    expect(h.room.phase).toBe('playing');
    expect(h.room.game?.scores).toEqual([0, 0]);
    expect(h.room.seats[0]).toMatchObject({ kind: 'human', playerId: 'ann' });
  });
});

/** Plays on for the humans until the first hand result is up. */
async function playToResult(h: Harness, humans: readonly string[]): Promise<void> {
  const showing = () => h.room.game?.phase === 'hand-complete';
  for (let i = 0; i < 2_000 && !showing(); i++) {
    await vi.advanceTimersByTimeAsync(5);
    for (const id of humans) {
      if (showing()) break;
      humanActs(h, id);
    }
  }
  expect(showing()).toBe(true);
}

describe('hand result', () => {
  it('waits for the humans to confirm, then deals at once', async () => {
    const h = harness({ handResultMs: 20_000 });
    readyRoom(h);
    h.room.start('ann');
    await playToResult(h, ['ann']);

    const view = h.last('ann', 'view');
    expect(view).toMatchObject({ resultTimer: { totalMs: 20_000 } });

    // The bots confirm quickly; Ann is still reading.
    await vi.advanceTimersByTimeAsync(50);
    expect(h.room.game?.hand?.continuePending).toEqual([0]);
    expect(h.room.game?.phase).toBe('hand-complete');

    expect(h.room.action('ann', { type: 'continue' })).toBeNull();
    expect(h.room.game?.hand?.handNumber).toBe(2);
    expect(h.last('ann', 'view')).not.toHaveProperty('resultTimer');
  });

  it('deals the next hand when the countdown runs out', async () => {
    const h = harness({ handResultMs: 20_000 });
    readyRoom(h);
    h.room.start('ann');
    await playToResult(h, ['ann']);

    await vi.advanceTimersByTimeAsync(19_000);
    expect(h.room.game?.phase).toBe('hand-complete');
    await vi.advanceTimersByTimeAsync(1_100);
    expect(h.room.game?.hand?.handNumber).toBe(2);
    expect(h.room.game?.hand?.phase).toBe('bidding');
  });

  it('does not let one human close the result for another', async () => {
    const h = harness({ handResultMs: 20_000 });
    h.room.join('ann', 'Ann');
    h.room.join('bob', 'Bob');
    h.room.sit('ann', 0);
    h.room.sit('bob', 1);
    h.room.setBot('ann', 2, 'easy');
    h.room.setBot('ann', 3, 'easy');
    h.room.start('ann');
    await playToResult(h, ['ann', 'bob']);
    await vi.advanceTimersByTimeAsync(50);

    expect(h.room.action('ann', { type: 'continue' })).toBeNull();
    expect(h.room.game?.phase).toBe('hand-complete');
    expect(h.room.game?.hand?.continuePending).toEqual([1]);
    expect(h.room.action('ann', { type: 'continue' })).toEqual(
      expect.objectContaining({ code: 'ILLEGAL_ACTION' }),
    );
    expect(h.room.action('bob', { type: 'continue' })).toBeNull();
    expect(h.room.game?.hand?.handNumber).toBe(2);
  });
});

describe('solo', () => {
  /** A solo room as the manager makes it: Ann alone, at Seat 1, with three bots. */
  function soloRoom(overrides = {}): Harness {
    const h = harness(overrides, true);
    h.room.join('ann', 'Ann');
    h.room.sit('ann', 0);
    return h;
  }

  it('is private: no one else can join it, but its player can come back', () => {
    const h = soloRoom();
    expect(h.room.join('bob', 'Bob')).toEqual(expect.objectContaining({ code: 'ROOM_NOT_FOUND' }));
    expect(h.room.members.has('bob')).toBe(false);
    h.room.disconnect('ann');
    expect(h.room.join('ann', 'Ann')).toBeNull();
    expect(h.last('ann', 'room')).toMatchObject({
      room: { solo: true, analysis: 'off', canUndo: false, canRedo: false, yourSeat: 0 },
    });
  });

  it('lets its player set every bot and choose the analysis', () => {
    const h = soloRoom();
    for (const seat of [1, 2, 3] as const) expect(h.room.setBot('ann', seat, 'hard')).toBeNull();
    expect(h.room.setAnalysis('ann', 'hints')).toBeNull();
    expect(h.last('ann', 'room')).toMatchObject({
      room: {
        analysis: 'hints',
        seats: [
          expect.objectContaining({ kind: 'human' }),
          expect.objectContaining({ difficulty: 'hard' }),
          expect.objectContaining({ difficulty: 'hard' }),
          expect.objectContaining({ difficulty: 'hard' }),
        ],
      },
    });
  });

  it('offers the analysis only in solo rooms', () => {
    const h = harness();
    readyRoom(h);
    expect(h.room.setAnalysis('ann', 'hints')).toEqual(
      expect.objectContaining({ code: 'NOT_SOLO' }),
    );
  });

  it('keeps the hand result up until its player is ready, with no countdown', async () => {
    const h = soloRoom({ handResultMs: 20_000 });
    h.room.start('ann');
    await playToResult(h, ['ann']);
    expect(h.last('ann', 'view')).not.toHaveProperty('resultTimer');
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(h.room.game?.phase).toBe('hand-complete');
    expect(h.room.game?.hand?.continuePending).toEqual([0]);
    expect(h.room.action('ann', { type: 'continue' })).toBeNull();
    expect(h.room.game?.hand?.handNumber).toBe(2);
  });

  it('waits for its player rather than handing the seat to a bot, then closes when idle', async () => {
    const h = soloRoom();
    h.room.start('ann');
    await vi.advanceTimersByTimeAsync(10);
    const before = h.room.game;
    h.room.disconnect('ann');
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(h.room.isBotControlled(0)).toBe(false);
    expect(h.room.game).toBe(before);
    expect(h.room.members.has('ann')).toBe(true);
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    expect(h.room.isClosed).toBe(true);
  });

  it('closes when its player leaves, in the lobby or mid-game', () => {
    const lobby = soloRoom();
    lobby.room.leave('ann');
    expect(lobby.room.isClosed).toBe(true);
    const playing = soloRoom();
    playing.room.start('ann');
    playing.room.leave('ann');
    expect(playing.room.isClosed).toBe(true);
  });

  describe('undo and redo', () => {
    /** Plays on (confirming results) until Ann has a decision to make. */
    async function untilAnnDecides(h: Harness): Promise<void> {
      for (let i = 0; i < 2_000; i++) {
        const game = h.room.game;
        const kind = game ? legalMoves(game, 0).kind : 'none';
        if (kind !== 'none' && kind !== 'continue') return;
        if (kind === 'continue') humanActs(h, 'ann');
        await vi.advanceTimersByTimeAsync(5);
      }
      throw new Error('Ann never had a decision');
    }

    async function started(): Promise<Harness> {
      const h = soloRoom();
      h.room.start('ann');
      await untilAnnDecides(h);
      return h;
    }

    it('takes back a decision to the moment Ann had it, and replays the same line', async () => {
      const h = await started();
      const first = h.room.game;
      humanActs(h, 'ann');
      await untilAnnDecides(h);
      const second = h.room.game;
      expect(h.last('ann', 'room')).toMatchObject({ room: { canUndo: true, canRedo: false } });

      h.clear();
      expect(h.room.undo('ann')).toBeNull();
      expect(h.room.game).toEqual(first);
      const sent = h.sent.get('ann') ?? [];
      expect(sent[0]).toEqual({ type: 'rewound', by: 'undo' });
      expect(sent.find((m) => m.type === 'view')).toBeDefined();
      expect(h.last('ann', 'room')).toMatchObject({ room: { canUndo: false, canRedo: true } });

      // Nothing moves while it is Ann's turn again, and redo brings back the bots' replies.
      await vi.advanceTimersByTimeAsync(1_000);
      expect(h.room.game).toEqual(first);
      expect(h.room.redo('ann')).toBeNull();
      expect(h.room.game).toEqual(second);
      expect(h.last('ann', 'room')).toMatchObject({ room: { canUndo: true, canRedo: false } });
    });

    it('steps back more than once, and forgets the undone line once Ann plays on', async () => {
      const h = await started();
      const first = h.room.game;
      humanActs(h, 'ann');
      await untilAnnDecides(h);
      humanActs(h, 'ann');
      await untilAnnDecides(h);
      expect(h.room.undo('ann')).toBeNull();
      expect(h.room.undo('ann')).toBeNull();
      expect(h.room.game).toEqual(first);
      expect(h.room.undo('ann')).toEqual(expect.objectContaining({ code: 'NOTHING_TO_UNDO' }));

      humanActs(h, 'ann');
      expect(h.last('ann', 'room')).toMatchObject({ room: { canRedo: false } });
      expect(h.room.redo('ann')).toEqual(expect.objectContaining({ code: 'NOTHING_TO_UNDO' }));
    });

    it('drops a bot answer that was still on its way', async () => {
      const h = soloRoom({ botDelayMs: { easy: 500, normal: 500, hard: 500 } });
      h.room.start('ann');
      await untilAnnDecides(h);
      const first = h.room.game;
      humanActs(h, 'ann');
      await vi.advanceTimersByTimeAsync(100); // a bot is thinking
      expect(h.room.undo('ann')).toBeNull();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(h.room.game).toEqual(first);
    });

    it('reaches back into the hand before', async () => {
      const h = soloRoom();
      h.room.start('ann');
      await playToResult(h, ['ann']);
      await untilAnnDecides(h);
      expect(h.room.game?.hand?.handNumber).toBe(2);
      // Each undo steps back one of Ann's decisions, through hand 2 and into hand 1.
      for (let i = 0; i < 20 && h.room.game?.hand?.handNumber === 2; i++) {
        expect(h.room.undo('ann')).toBeNull();
      }
      expect(h.room.game?.hand?.handNumber).toBe(1);
      expect(h.room.game?.hand?.phase).not.toBe('hand-complete');
    });

    it('is only offered in solo rooms', () => {
      const h = harness();
      readyRoom(h);
      h.room.start('ann');
      expect(h.room.undo('ann')).toEqual(expect.objectContaining({ code: 'NOT_SOLO' }));
      expect(h.room.redo('ann')).toEqual(expect.objectContaining({ code: 'NOT_SOLO' }));
      expect(h.last('ann', 'room')).toMatchObject({ room: { canUndo: false, canRedo: false } });
    });
  });

  describe('analysis', () => {
    /** An analyser whose answers wait until the test releases them. */
    function deferred() {
      const calls: {
        obs: Parameters<AnalyzeSeat>[0];
        include: readonly number[] | null;
        release(): void;
      }[] = [];
      const fn: AnalyzeSeat = (obs, _seed, _deadline, include) =>
        new Promise((resolve) => {
          calls.push({
            obs,
            include: include ?? null,
            release: () =>
              resolve(analyze(obs, Rng.fromSeed(1), CHEAP, undefined, include ?? null)),
          });
        });
      return { fn, calls };
    }

    const sentOf = (h: Harness, type: ServerMessage['type']) =>
      (h.sent.get('ann') ?? []).filter((m) => m.type === type);

    async function untilAnnDecides(h: Harness): Promise<void> {
      for (let i = 0; i < 2_000; i++) {
        const kind = h.room.game ? legalMoves(h.room.game, 0).kind : 'none';
        if (kind !== 'none' && kind !== 'continue') return;
        if (kind === 'continue') humanActs(h, 'ann');
        await vi.advanceTimersByTimeAsync(5);
      }
      throw new Error('Ann never had a decision');
    }

    /** A solo room with Ann seated, showing hints (`true`), feedback or nothing, started. */
    function begun(on: boolean | AnalysisMode, analyzer?: AnalyzeSeat): Harness {
      const h = harness({}, true, analyzer);
      h.room.join('ann', 'Ann');
      h.room.sit('ann', 0);
      const mode = on === true ? 'hints' : on === false ? 'off' : on;
      if (mode !== 'off') h.room.setAnalysis('ann', mode);
      h.room.start('ann');
      return h;
    }

    it('sends nothing while it is off', async () => {
      const h = begun(false);
      await untilAnnDecides(h);
      humanActs(h, 'ann');
      await vi.advanceTimersByTimeAsync(50);
      expect(sentOf(h, 'analysis')).toHaveLength(0);
      expect(sentOf(h, 'moveReview')).toHaveLength(0);
    });

    it('with feedback only, reviews each move but sends no hints', async () => {
      const h = begun('feedback');
      await untilAnnDecides(h);
      await vi.advanceTimersByTimeAsync(0);
      humanActs(h, 'ann');
      await vi.advanceTimersByTimeAsync(50);
      expect(sentOf(h, 'analysis')).toHaveLength(0);
      expect(sentOf(h, 'moveReview')).toHaveLength(1);
      // Switching to hints mid-game shows the position on the table at once.
      await untilAnnDecides(h);
      expect(h.room.setAnalysis('ann', 'hints')).toBeNull();
      await vi.advanceTimersByTimeAsync(0);
      expect(sentOf(h, 'analysis').at(-1)).toMatchObject({ decision: expect.any(Object) });
    });

    it('values each position after its view, with the options on her turn', async () => {
      const h = begun(true);
      await untilAnnDecides(h);
      await vi.advanceTimersByTimeAsync(0);
      const all = sentOf(h, 'analysis');
      expect(all.length).toBeGreaterThan(0);
      const last = all.at(-1);
      if (last?.type !== 'analysis') throw new Error('no analysis');
      expect(last.winChance).toBeGreaterThanOrEqual(0);
      expect(last.winChance).toBeLessThanOrEqual(1);
      expect(last.decision?.options.length).toBeGreaterThan(0);
      // It always follows the view it belongs to.
      const list = h.sent.get('ann') ?? [];
      expect(list.lastIndexOf(last)).toBeGreaterThan(list.findLastIndex((m) => m.type === 'view'));
    });

    it('drops an analysis that arrives after the position has changed', async () => {
      const d = deferred();
      const h = begun(true, d.fn);
      await untilAnnDecides(h);
      const pending = d.calls.length;
      humanActs(h, 'ann');
      // Every analysis asked for before the move is of a position the table no longer shows.
      for (const c of d.calls.slice(0, pending)) c.release();
      await vi.advanceTimersByTimeAsync(0);
      expect(sentOf(h, 'analysis')).toHaveLength(0);
    });

    it('reviews a move made before its analysis was ready', async () => {
      const d = deferred();
      const h = begun(true, d.fn);
      await untilAnnDecides(h);
      humanActs(h, 'ann');
      await vi.advanceTimersByTimeAsync(50); // the game moves on meanwhile
      for (const c of d.calls) c.release();
      await vi.advanceTimersByTimeAsync(0);
      for (const c of d.calls) c.release(); // a discard may need a second look
      await vi.advanceTimersByTimeAsync(0);
      const [review] = sentOf(h, 'moveReview');
      expect(review).toMatchObject({ type: 'moveReview', ply: expect.any(Number) });
      expect(h.room.reviews).toHaveLength(1);
    });

    it('sends the game review once the game is over', async () => {
      // Values every legal choice (the first best, each next 1k worse), a little late, so
      // the last move's review can land after the game has ended.
      const flat: AnalyzeSeat = (obs, _seed, _deadline, include) => {
        const l = obs.legal;
        const actions: Action[] =
          l.kind === 'play'
            ? l.cardIds.map((cardId) => ({ type: 'playCard', cardId }))
            : l.kind === 'bid'
              ? [
                  { type: 'bid', amount: l.minBid },
                  ...(l.canPass ? [{ type: 'pass' as const }] : []),
                ]
              : l.kind === 'trump'
                ? l.suits.map((suit) => ({ type: 'nameTrump', suit }))
                : l.kind === 'discard' && include
                  ? [{ type: 'discard', cardIds: [...include] }]
                  : [];
        const kind =
          l.kind === 'play' || l.kind === 'bid' || l.kind === 'discard' ? l.kind : 'trump';
        const options = actions.map((action, i) => ({ action, points: -i, winChance: 0.5 }));
        const analysis: Analysis = {
          winChance: 0.5,
          decision: options.length > 0 ? { kind, options, best: 0 } : null,
        };
        return new Promise((resolve) => setTimeout(() => resolve(analysis), 50));
      };
      const h = begun('feedback', flat);
      const act = vi.spyOn(h.room, 'action');
      for (let i = 0; i < 20_000 && h.room.phase === 'playing'; i++) {
        await vi.advanceTimersByTimeAsync(5);
        if (h.room.phase === 'playing') humanActs(h, 'ann');
        if (i === 100) {
          expect(h.last('ann', 'room')).toMatchObject({ room: { gameReview: null } });
        }
      }
      expect(h.room.phase).toBe('finished');
      await vi.advanceTimersByTimeAsync(500);
      const room = h.last('ann', 'room');
      if (room?.type !== 'room') throw new Error('no room');
      const review = room.room.gameReview ?? [];
      expect(review.length).toBeGreaterThan(20);
      expect(review).toHaveLength(sentOf(h, 'moveReview').length);
      // Each review is of one of Ann's own actions, in the order she made them.
      const anns = act.mock.calls.filter(([id]) => id === 'ann').map(([, a]) => a);
      let j = 0;
      review.forEach((m, i) => {
        if (i > 0) expect(m.ply).toBeGreaterThan((review[i - 1] as { ply: number }).ply);
        while (j < anns.length && JSON.stringify(anns[j]) !== JSON.stringify(m.played)) j++;
        expect(j).toBeLessThan(anns.length);
        j++;
        expect(m.hand).toBeGreaterThanOrEqual(1);
        if (m.played.type === 'playCard') {
          expect(m.trick).toBeGreaterThanOrEqual(1);
          expect(m.trick).toBeLessThanOrEqual(13);
        } else expect(m.trick).toBeNull();
      });
    });

    it('sends no review for a move taken back first', async () => {
      const d = deferred();
      const h = begun(true, d.fn);
      await untilAnnDecides(h);
      humanActs(h, 'ann');
      expect(h.room.undo('ann')).toBeNull();
      for (const c of d.calls) c.release();
      await vi.advanceTimersByTimeAsync(0);
      expect(sentOf(h, 'moveReview')).toHaveLength(0);
    });

    it('values a position met again after an undo exactly as before', async () => {
      const h = begun(true);
      await untilAnnDecides(h);
      await vi.advanceTimersByTimeAsync(0);
      const first = sentOf(h, 'analysis').at(-1);
      humanActs(h, 'ann');
      await untilAnnDecides(h);
      h.clear();
      expect(h.room.undo('ann')).toBeNull();
      await vi.advanceTimersByTimeAsync(0);
      expect(sentOf(h, 'analysis').at(-1)).toEqual(first);
    });

    it('never holds up the bots, even when it never answers', async () => {
      const h = begun(true, () => new Promise(() => {}));
      await untilAnnDecides(h);
      const before = h.room.game;
      humanActs(h, 'ann');
      await untilAnnDecides(h);
      expect(h.room.game).not.toBe(before);
    });
  });
});
