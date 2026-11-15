import { describe, expect, it } from 'vitest';
import { playStateFromGame } from '../src/play/convert';
import { type LeafUtility, Solver } from '../src/play/solver';
import { bruteForce, randomPlayStates } from './helpers';

/** A non-linear utility with a threshold, like a contract. */
const contractLike: LeafUtility = (c0, c1) => (c0 >= 60 ? 1 : 0) * 10 + (c0 - c1) / 50;

function endgames(maxCards: number, games: number) {
  const out = [];
  for (let g = 0; g < games; g++) {
    for (const st of randomPlayStates(`endgame-${g}`)) {
      const s = playStateFromGame(st);
      if (s.cardsInHands + s.trickCount <= maxCards) {
        out.push(st);
        break;
      }
    }
  }
  return out;
}

describe('Solver', () => {
  const positions = endgames(9, 120);

  it('matches brute-force minimax in linear mode', () => {
    for (const st of positions) {
      const solver = new Solver({ mode: 'linear' });
      expect(solver.solve(playStateFromGame(st))).toBe(
        bruteForce(playStateFromGame(st), 'linear', () => 0),
      );
    }
  });

  it('matches brute-force minimax in utility mode', () => {
    for (const st of positions) {
      const solver = new Solver({ mode: 'utility', utility: contractLike });
      expect(solver.solve(playStateFromGame(st))).toBeCloseTo(
        bruteForce(playStateFromGame(st), 'utility', contractLike),
        9,
      );
    }
  });

  it('gives exact values for every root move, reusing its cache', () => {
    const solver = new Solver({ mode: 'linear' });
    for (const st of positions.slice(0, 40)) {
      solver.clear();
      const s = playStateFromGame(st);
      const { moves, values } = solver.rootValues(s);
      moves.forEach((m, i) => {
        const ref = playStateFromGame(st);
        const before = ref.cap0 - ref.cap1;
        ref.play(m);
        const delta = ref.cap0 - ref.cap1 - before;
        expect(values[i]).toBe(delta + bruteForce(ref, 'linear', () => 0));
      });
    }
  });

  it('leaves the position untouched', () => {
    const st = positions[0];
    if (!st) throw new Error('no position');
    const s = playStateFromGame(st);
    const snapshot = JSON.stringify([Array.from(s.hand), Array.from(s.spec), s.turn, s.cap0]);
    new Solver({ mode: 'linear' }).rootValues(s);
    expect(JSON.stringify([Array.from(s.hand), Array.from(s.spec), s.turn, s.cap0])).toBe(snapshot);
  });

  it.skip('solves a full hand from the first trick', () => {
    const st = randomPlayStates('full')[0];
    if (!st) throw new Error('no position');
    const solver = new Solver({ mode: 'linear' });
    const v = solver.solve(playStateFromGame(st));
    expect(Number.isFinite(v)).toBe(true);
    expect(Math.abs(v)).toBeLessThanOrEqual(800);
  });
});
