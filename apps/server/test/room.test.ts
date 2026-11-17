import { fallbackAction } from '@mam/bots';
import type { Action } from '@mam/engine';
import type { ServerMessage } from '@mam/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decideInline } from '../src/botPool';
import { testConfig } from '../src/config';
import { silentLogger } from '../src/log';
import { Room } from '../src/room';

interface Harness {
  room: Room;
  sent: Map<string, ServerMessage[]>;
  closed: Room[];
  last(playerId: string, type: ServerMessage['type']): ServerMessage | undefined;
  clear(): void;
}

function harness(overrides = {}): Harness {
  const sent = new Map<string, ServerMessage[]>();
  const closed: Room[] = [];
  const room = new Room('ABC123', {
    config: testConfig({ graceMs: 60_000, roomIdleMs: 600_000, ...overrides }),
    log: silentLogger,
    send: (id, msg) => {
      const list = sent.get(id) ?? [];
      list.push(msg);
      sent.set(id, list);
    },
    onClosed: (r) => closed.push(r),
    decideBot: decideInline,
  });
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
  h.room.addBot('ann', 1, 'easy');
  h.room.addBot('ann', 2, 'normal');
  h.room.addBot('ann', 3, 'easy');
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
  it('makes the first member the host and lets members pick seats', () => {
    const h = harness();
    h.room.join('ann', 'Ann');
    h.room.join('bob', 'Bob');
    expect(h.room.hostId).toBe('ann');
    expect(h.room.sit('ann', 2)).toBeNull();
    expect(h.room.sit('bob', 2)).toEqual(expect.objectContaining({ code: 'SEAT_TAKEN' }));
    expect(h.room.sit('bob', 0)).toBeNull();
    expect(h.room.sit('ann', 1)).toBeNull(); // moving seats
    expect(h.room.seats[2]).toBeNull();
    const view = h.last('bob', 'room');
    expect(view).toMatchObject({ type: 'room', room: { yourSeat: 0, hostId: 'ann' } });
  });

  it('lets only the host manage bots and start, and needs four filled seats with a human', () => {
    const h = harness();
    h.room.join('ann', 'Ann');
    h.room.join('bob', 'Bob');
    expect(h.room.addBot('bob', 1, 'easy')).toEqual(expect.objectContaining({ code: 'NOT_HOST' }));
    expect(h.room.start('ann')).toEqual(expect.objectContaining({ code: 'ROOM_NOT_READY' }));
    h.room.addBot('ann', 0, 'easy');
    h.room.addBot('ann', 1, 'easy');
    h.room.addBot('ann', 2, 'easy');
    h.room.addBot('ann', 3, 'easy');
    expect(h.room.start('ann')).toEqual(expect.objectContaining({ code: 'ROOM_NOT_READY' }));
    expect(h.room.removeBot('ann', 3)).toBeNull();
    h.room.sit('ann', 3);
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
    expect(h.room.seats[1]).toBeNull();
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

    // Bidding opens with the deal: the bots call in turn after their fixed delays, and
    // every seat gets a turn before the auction can end, so it comes round to Ann.
    await vi.advanceTimersByTimeAsync(10);
    expect(h.room.game?.hand?.phase).toBe('bidding');
    expect(h.room.game?.hand?.turn).toBe(0);
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

describe('hand result', () => {
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
    h.room.addBot('ann', 2, 'easy');
    h.room.addBot('ann', 3, 'easy');
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
