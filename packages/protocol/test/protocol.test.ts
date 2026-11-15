import { describe, expect, it } from 'vitest';
import {
  ActionSchema,
  ClientMessageSchema,
  parseClientMessage,
  RoomCodeSchema,
} from '../src/index';

describe('client messages', () => {
  it('parses valid messages', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'hello', name: '  Trent ' }))).toEqual({
      type: 'hello',
      name: 'Trent',
    });
    expect(parseClientMessage(JSON.stringify({ type: 'joinRoom', code: 'abc123' }))).toEqual({
      type: 'joinRoom',
      code: 'ABC123',
    });
    expect(
      parseClientMessage(
        JSON.stringify({ type: 'action', action: { type: 'bid', amount: 175000 } }),
      ),
    ).toEqual({ type: 'action', action: { type: 'bid', amount: 175000 } });
  });

  it('rejects malformed input', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage(42)).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'nope' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'hello', name: '' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'hello', name: 'x'.repeat(21) }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'sit', seat: 4 }))).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ type: 'addBot', seat: 1, difficulty: 'godlike' })),
    ).toBeNull();
  });

  it('validates action shapes without judging legality', () => {
    expect(ActionSchema.safeParse({ type: 'discard', cardIds: [1, 2] }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: 'discard', cardIds: [1, 2, 3] }).success).toBe(true);
    expect(ActionSchema.safeParse({ type: 'playCard', cardId: 55 }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: 'nameTrump', suit: 'blue' }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: 'bid', amount: 5_000_000 }).success).toBe(true);
  });

  it('normalises room codes', () => {
    expect(RoomCodeSchema.parse(' q7x2mz ')).toBe('Q7X2MZ');
    expect(RoomCodeSchema.safeParse('TOO-LONG').success).toBe(false);
  });

  it('exposes every message type exactly once', () => {
    const types = ClientMessageSchema.options.map((o) => o.shape.type.value);
    expect(new Set(types).size).toBe(types.length);
  });
});
