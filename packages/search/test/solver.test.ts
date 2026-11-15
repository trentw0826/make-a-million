import { describe, expect, it } from 'vitest';
import { splitRest } from '../src/equity';
import { playStateFromGame } from '../src/play/convert';
import { DeadlineExceeded, type LeafUtility, SearchAborted, Solver } from '../src/play/solver';
import { BEAR, BULL, SPEC_BEAR, SPEC_BULL } from '../src/play/state';
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

describe('utility applied at the root (splitRest)', () => {
  /** Strictly increasing in team 0's money and decreasing in team 1's, with a threshold. */
  const monotone: LeafUtility = (c0, c1) => (c0 >= 90 ? 5 : 0) + c0 / 40 - c1 / 70;

  it('matches the utility-mode search once no Bull or Bear can affect the rest', () => {
    let checked = 0;
    for (let g = 0; g < 400 && checked < 40; g++) {
      for (const st of randomPlayStates(`split-${g}`)) {
        const s = playStateFromGame(st);
        // A Bull/Bear in a hand, or in the trick in progress (it scales the cards still to
        // come into that trick), makes the money still out depend on the play.
        const inHands = [0, 1, 2, 3].some(
          (seat) => ((s.spec[seat] as number) & (SPEC_BULL | SPEC_BEAR)) !== 0,
        );
        const inTrick = Array.from(s.trickCards.subarray(0, s.trickCount)).some(
          (c) => c === BULL || c === BEAR,
        );
        if (inHands || inTrick || s.cardsInHands + s.trickCount > 12) continue;
        const exact = new Solver({ mode: 'utility', utility: monotone }).rootValues(s);
        const linear = new Solver({ mode: 'linear' }).rootValues(s);
        const rest = s.moneyOutK();
        expect(linear.moves).toEqual(exact.moves);
        linear.values.forEach((v, i) => {
          const [f0, f1] = splitRest(s.cap0, s.cap1, rest, v);
          expect(monotone(f0, f1)).toBeCloseTo(exact.values[i] as number, 9);
        });
        checked += 1;
        break;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(20);
  });

  it('never gives a team less than it already has', () => {
    expect(splitRest(10, 20, 50, 30)).toEqual([50, 30]);
    expect(splitRest(10, 20, 50, -50)).toEqual([10, 70]);
    // A Bull can make the margin exceed the money out: the loser wins nothing.
    expect(splitRest(10, 20, 50, 80)).toEqual([90, 20]);
    expect(splitRest(10, 20, 50, -100)).toEqual([10, 120]);
  });
});

describe('Solver deadline', () => {
  const opening = () => {
    const states = randomPlayStates('deadline').map(playStateFromGame);
    return states.reduce((a, b) => (b.cardsInHands > a.cardsInHands ? b : a));
  };

  it('stops a long search once the clock passes its deadline', () => {
    const solver = new Solver({ mode: 'linear' });
    solver.deadline = Date.now() - 1;
    let thrown: unknown;
    try {
      solver.solve(opening());
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(DeadlineExceeded);
    // Callers that only know node budgets still see an aborted search.
    expect(thrown).toBeInstanceOf(SearchAborted);
    expect(solver.nodes).toBeLessThan(5000);
  });

  it('never fires without a deadline', () => {
    const solver = new Solver({ mode: 'linear' });
    solver.depthTricks = 1;
    expect(() => solver.rootValues(opening())).not.toThrow();
  });
});
