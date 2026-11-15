import {
  cardById,
  createGame,
  isNumberCard,
  Rng,
  requiredNumberDiscards,
  SUITS,
} from '@mam/engine';
import { describe, expect, it } from 'vitest';
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
});
