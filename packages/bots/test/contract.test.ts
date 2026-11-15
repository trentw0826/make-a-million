import {
  cardById,
  createGame,
  isNumberCard,
  Rng,
  requiredNumberDiscards,
  SUITS,
} from '@mam/engine';
import { describe, expect, it } from 'vitest';
import { calibrated } from '../src/contract/index';
import { combinations, discardCandidates, playoutDeclare } from '../src/contract/simulate';

describe('contract simulation', () => {
  it('enumerates combinations', () => {
    expect(combinations([1, 2, 3, 4], 2)).toHaveLength(6);
    expect(combinations([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
    expect(combinations([1, 2], 0)).toEqual([[]]);
  });

  it('only proposes legal discards', () => {
    const rng = Rng.fromSeed('discards');
    for (let g = 0; g < 200; g++) {
      const state = createGame({ seed: `discard-${g}` });
      const hand = state.hand;
      if (!hand) throw new Error('no hand');
      const seat = rng.int(4) as 0 | 1 | 2 | 3;
      const cards16 = [...hand.hands[seat], ...hand.widow];
      const required = requiredNumberDiscards(cards16);
      for (const trump of SUITS) {
        const candidates = discardCandidates(cards16, trump);
        expect(candidates.length).toBeGreaterThan(0);
        for (const d of candidates) {
          expect(new Set(d).size).toBe(3);
          for (const c of d) {
            expect(cards16).toContain(c);
            expect(cardById(c).kind).toBe('suit');
          }
          expect(d.filter((c) => isNumberCard(cardById(c))).length).toBeGreaterThanOrEqual(
            required,
          );
        }
      }
    }
  });

  it('plays a deal out to the end and accounts for all money', () => {
    const state = createGame({ seed: 'playout' });
    const hand = state.hand;
    if (!hand) throw new Error('no hand');
    const [c0, c1] = playoutDeclare({ hands: hand.hands, widow: hand.widow }, 1);
    // Up to $400k plus a Bull doubling, minus anything discarded.
    expect(c0 + c1).toBeGreaterThan(0);
    expect(c0 + c1).toBeLessThanOrEqual(520);
  });

  it('calibrates a playout estimate before applying the utility', () => {
    const own0 = (c: readonly [number, number]) => c[0] - c[1];
    // Identity by default.
    expect(calibrated(own0, 0, { calibA: 0, calibB: 1, calibSd: 0 })).toBe(own0);
    // A shift moves money from the other team; the points' weights sum to one.
    const shifted = calibrated(own0, 0, { calibA: 10, calibB: 1, calibSd: 0 });
    expect(shifted([100, 200])).toBeCloseTo(110 - 190, 6);
    const flat = calibrated(() => 7, 1, { calibA: 130, calibB: 0.5, calibSd: 58 });
    expect(flat([150, 150])).toBeCloseTo(7, 6);
    // A linear utility sees only the mean: 130 + 0.5 × 100 = 180 for team 1.
    const linear1 = calibrated((c) => c[1], 1, { calibA: 130, calibB: 0.5, calibSd: 20 });
    expect(linear1([300, 100])).toBeCloseTo(180, 6);
    // A threshold sees the spread: P(capture ≥ 175) for mean 175 is one half.
    const made = calibrated((c) => (c[0] >= 175 ? 1 : 0), 0, {
      calibA: 175,
      calibB: 0,
      calibSd: 50,
    });
    expect(made([0, 0])).toBeCloseTo(0.5, 6);
    const likely = calibrated((c) => (c[0] >= 175 ? 1 : 0), 0, {
      calibA: 225,
      calibB: 0,
      calibSd: 50,
    });
    // P(Z ≥ −1) ≈ 0.84.
    expect(likely([0, 0])).toBeGreaterThan(0.75);
    expect(likely([0, 0])).toBeLessThan(0.92);
  });
});
