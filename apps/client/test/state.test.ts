import { createGame, observe, tableView } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { describe, expect, it } from 'vitest';
import { initialState, reduce } from '../src/state';

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
};

describe('client reducer', () => {
  it('records identity, room and view', () => {
    let s = reduce(initialState, {
      kind: 'server',
      message: { type: 'welcome', playerId: 'p1', token: 't', name: 'Ann' },
    });
    s = reduce(s, { kind: 'server', message: { type: 'room', room } });
    const view = tableView(observe(createGame({ seed: 'ui' }), 0));
    s = reduce(s, { kind: 'server', message: { type: 'view', view } });
    expect(s.me).toEqual({ playerId: 'p1', name: 'Ann' });
    expect(s.room?.code).toBe('ABC123');
    expect(s.view?.hand).toHaveLength(13);
  });

  it('narrates events with seat names and keeps the finished trick to show', () => {
    let s = reduce(initialState, { kind: 'server', message: { type: 'room', room } });
    s = reduce(s, {
      kind: 'server',
      message: {
        type: 'events',
        events: [
          { type: 'bid', seat: 1, amount: 175_000 },
          { type: 'pass', seat: 2 },
          { type: 'trumpNamed', seat: 1, suit: 'green' },
          { type: 'cardPlayed', seat: 1, cardId: 3 },
          { type: 'cardPlayed', seat: 2, cardId: 4 },
          { type: 'cardPlayed', seat: 3, cardId: 5 },
          { type: 'cardPlayed', seat: 0, cardId: 12 },
          { type: 'trickWon', seat: 0, trickIndex: 0 },
        ],
      },
    });
    expect(s.log.map((e) => e.text)).toEqual([
      'Bot 2 bids $175,000.',
      'Cid passes.',
      'Bot 2 names Green as trump.',
      'Bot 2 plays 4.',
      'Cid plays $5k.',
      'Bot 4 plays 7.',
      'Ann plays $40k.',
      'Ann takes trick 1.',
    ]);
    expect(s.completedTrick).toEqual({
      winner: 0,
      plays: [
        { seat: 1, cardId: 3 },
        { seat: 2, cardId: 4 },
        { seat: 3, cardId: 5 },
        { seat: 0, cardId: 12 },
      ],
    });
    expect(s.trickPlays).toEqual([]);
    s = reduce(s, { kind: 'clearCompletedTrick' });
    expect(s.completedTrick).toBeNull();
  });

  it('clears the table when leaving and shows why', () => {
    let s = reduce(initialState, { kind: 'server', message: { type: 'room', room } });
    s = reduce(s, { kind: 'server', message: { type: 'left', reason: 'closed' } });
    expect(s.room).toBeNull();
    expect(s.toast).toMatchObject({ kind: 'info', text: 'The room has closed.' });
  });

  it('turns server errors into toasts', () => {
    const s = reduce(initialState, {
      kind: 'server',
      message: { type: 'error', code: 'ILLEGAL_ACTION', message: 'you must follow the suit led' },
    });
    expect(s.toast).toMatchObject({ kind: 'error', text: 'you must follow the suit led' });
  });
});
