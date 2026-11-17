import {
  BULL_ID,
  createGame,
  observe,
  type Suit,
  type TableView,
  TIGER_ID,
  type TrickPlay,
  tableView,
} from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { describe, expect, it } from 'vitest';
import { blockedReason, hasPassed, listNames, playHint, seatChip, waitingText } from '../src/hints';

const room: RoomView = {
  code: 'ABC123',
  phase: 'playing',
  hostId: 'p1',
  seats: [
    { kind: 'human', playerId: 'p1', name: 'Ann', connected: true, botControlled: false },
    { kind: 'bot', name: 'Bot 2', difficulty: 'easy' },
    { kind: 'human', playerId: 'p3', name: 'Cid', connected: true, botControlled: false },
    { kind: 'bot', name: 'Bot 4', difficulty: 'normal' },
  ],
  yourSeat: 0,
};

// Card ids: each color holds 13 ids in rank order (1 2 3 4 $5k 7 8 9 $10k 11 $15k $30k $40k).
const RED_1 = 0;
const RED_7 = 5;
const RED_40K = 12;
const YELLOW_1 = 13;
const BLACK_1 = 26;
const GREEN_1 = 39;

/** Seat 0's view of a fresh deal, with the parts under test replaced. */
const base = tableView(observe(createGame({ seed: 'hints' }), 0));
const view = (over: Partial<TableView>): TableView => ({ ...base, ...over });
const trick = (plays: TrickPlay[], suit: Suit | null) => ({
  leader: plays[0]?.seat ?? 0,
  plays,
  suit,
  winner: null,
});
const contract = { bidder: 1 as const, amount: 185_000 };

describe('waitingText', () => {
  it('names the player the table is waiting on', () => {
    expect(waitingText(view({ phase: 'bidding', turn: 2 }), room)).toBe('Waiting for Cid to bid…');
    expect(waitingText(view({ phase: 'discarding', contract }), room)).toBe(
      'Bot 2 picks up the widow and discards…',
    );
    expect(waitingText(view({ phase: 'naming-trump', contract }), room)).toBe(
      'Bot 2 is naming trump…',
    );
    expect(waitingText(view({ phase: 'playing', turn: 3 }), room)).toBe(
      'Waiting for Bot 4 to play…',
    );
  });
});

describe('playHint', () => {
  const redLed = trick([{ seat: 3, cardId: RED_7 }], 'red');

  it('says when this seat leads', () => {
    expect(playHint(view({ trump: 'green', currentTrick: trick([], null) }))).toBe('Your lead.');
  });

  it('asks to follow the color led when possible', () => {
    const v = view({ trump: 'green', hand: [RED_1, YELLOW_1], currentTrick: redLed });
    expect(playHint(v)).toBe('Follow Red.');
  });

  it('frees the player who is out of that color', () => {
    const v = view({ trump: 'green', hand: [YELLOW_1, BLACK_1], currentTrick: redLed });
    expect(playHint(v)).toBe('No Red: play any card.');
  });

  it('counts the Tiger as trump', () => {
    const v = view({
      trump: 'green',
      hand: [TIGER_ID, RED_1],
      currentTrick: trick([{ seat: 3, cardId: GREEN_1 }], 'green'),
    });
    expect(playHint(v)).toBe('Follow Green (trump).');
  });

  it('frees everyone until a card gives the trick a color', () => {
    const v = view({ trump: 'green', currentTrick: trick([{ seat: 3, cardId: BULL_ID }], null) });
    expect(playHint(v)).toBe('No color yet: play any card.');
  });
});

describe('blockedReason', () => {
  it('explains following the color, and the Tiger', () => {
    const v = view({
      trump: 'green',
      hand: [RED_1, YELLOW_1, TIGER_ID],
      currentTrick: trick([{ seat: 3, cardId: RED_7 }], 'red'),
      legal: { kind: 'play', cardIds: [RED_1] },
    });
    expect(blockedReason(YELLOW_1, v)).toBe('You must follow Red.');
    expect(blockedReason(TIGER_ID, v)).toBe(
      "The Tiger can't be played to Red while you can follow it.",
    );
    expect(blockedReason(RED_1, v)).toBeUndefined();
  });

  it('explains when the Bull and Bear may lead', () => {
    const v = view({
      trump: 'green',
      hand: [RED_1, BULL_ID],
      currentTrick: trick([], null),
      legal: { kind: 'play', cardIds: [RED_1] },
    });
    expect(blockedReason(BULL_ID, v)).toBe(
      'The Bull can be led only when nothing else is left in your hand.',
    );
  });

  it('explains what may not be discarded', () => {
    const v = view({
      legal: { kind: 'discard', requiredNumberCards: 3, forbiddenIds: [TIGER_ID] },
    });
    expect(blockedReason(TIGER_ID, v)).toBe("The Tiger can't be discarded.");
    expect(blockedReason(RED_40K, v)).toBe('Number cards must be discarded before Money.');
  });
});

describe('seatChip', () => {
  it('gives no seat a badge while the auction runs', () => {
    const v = view({
      phase: 'bidding',
      auction: [
        { seat: 1, kind: 'bid', amount: 175_000 },
        { seat: 2, kind: 'pass' },
        { seat: 3, kind: 'bid', amount: 185_000 },
      ],
    });
    for (const seat of [0, 1, 2, 3] as const) expect(seatChip(v, seat)).toBeNull();
  });

  it('leaves only the bidder a badge once the auction is over: the contract and trump', () => {
    const v = view({
      phase: 'playing',
      auction: [{ seat: 1, kind: 'bid', amount: 175_000 }],
      contract: { bidder: 1, amount: 175_000 },
      trump: 'green',
    });
    expect(seatChip(v, 1)).toEqual({ text: '$175k', kind: 'contract', trump: 'green' });
    expect(seatChip(v, 2)).toBeNull();
  });
});

describe('hasPassed', () => {
  it('marks a seat out of the auction once it passes', () => {
    const v = view({
      phase: 'bidding',
      auction: [
        { seat: 1, kind: 'bid', amount: 175_000 },
        { seat: 2, kind: 'pass' },
      ],
    });
    expect(hasPassed(v, 2)).toBe(true);
    expect(hasPassed(v, 1)).toBe(false);
    expect(hasPassed(v, 3)).toBe(false);
  });

  it('clears once the auction is over', () => {
    const v = view({ phase: 'discarding', auction: [{ seat: 2, kind: 'pass' }] });
    expect(hasPassed(v, 2)).toBe(false);
  });
});

describe('listNames', () => {
  it('reads like a sentence', () => {
    expect(listNames(['Ann'])).toBe('Ann');
    expect(listNames(['Ann', 'Cid'])).toBe('Ann and Cid');
    expect(listNames(['Ann', 'Bot 2', 'Cid'])).toBe('Ann, Bot 2 and Cid');
  });
});
