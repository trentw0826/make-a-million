import { applyActionOrThrow, legalMoves, Rng, sortHand, summarizeTrick, teamOf } from '@mam/engine';
import { describe, expect, it } from 'vitest';
import { playStateFromGame } from '../src/play/convert';
import { type PlayState, TIGER } from '../src/play/state';
import { randomPlayStates } from './helpers';

function handOf(s: PlayState, seat: number): number[] {
  const out: number[] = [];
  for (let c = 0; c < 55; c++) if (s.has(seat, c)) out.push(c);
  return out;
}

describe('PlayState agrees with the engine', () => {
  it('on legal moves, trick resolution and captured money in random hands', () => {
    const rng = Rng.fromSeed('diff');
    let positions = 0;
    for (let g = 0; g < 150; g++) {
      for (const state of randomPlayStates(`diff-${g}`)) {
        const hand = state.hand;
        if (!hand || hand.turn === null) continue;
        positions += 1;
        const s = playStateFromGame(state);
        // Legal moves.
        const buf = new Int32Array(16);
        const n = s.legalMoves(buf);
        const legal = legalMoves(state, hand.turn);
        if (legal.kind !== 'play') throw new Error('expected play');
        expect(sortHand(Array.from(buf.subarray(0, n)))).toEqual(sortHand(legal.cardIds));
        expect(s.turn).toBe(hand.turn);
        // Captured money so far.
        let c0 = 0;
        let c1 = 0;
        for (const t of hand.tricks) {
          const v = summarizeTrick(t).value / 1000;
          if (teamOf(t.winner as 0 | 1 | 2 | 3) === 0) c0 += v;
          else c1 += v;
        }
        expect([s.cap0, s.cap1]).toEqual([c0, c1]);
        // Apply the same random card to both and compare.
        const card = rng.pick(legal.cardIds);
        const next = applyActionOrThrow(state, hand.turn, { type: 'playCard', cardId: card }).state;
        s.play(card);
        const nh = next.hand;
        if (!nh) throw new Error('no hand');
        if (nh.phase === 'playing') {
          for (let seat = 0; seat < 4; seat++) expect(handOf(s, seat)).toEqual(nh.hands[seat]);
          expect(s.turn).toBe(nh.turn);
          expect(s.trickCount).toBe(nh.currentTrick?.plays.length ?? 0);
        } else {
          expect(s.done).toBe(true);
          const r = nh.result;
          if (!r) throw new Error('no result');
          expect([s.cap0 * 1000, s.cap1 * 1000]).toEqual(r.captured);
        }
        // Undo restores the position exactly.
        s.undo();
        const again = playStateFromGame(state);
        for (let seat = 0; seat < 4; seat++) expect(handOf(s, seat)).toEqual(handOf(again, seat));
        expect([s.turn, s.trickCount, s.trickSuit, s.cap0, s.cap1]).toEqual([
          again.turn,
          again.trickCount,
          again.trickSuit,
          again.cap0,
          again.cap1,
        ]);
      }
    }
    expect(positions).toBeGreaterThan(5000);
  }, 60_000);

  it('treats the Tiger as trump when following', () => {
    const states = randomPlayStates('tiger');
    const s = playStateFromGame(states[0] as (typeof states)[0]);
    expect(s.strength(TIGER)).toBe(1000);
  });
});
