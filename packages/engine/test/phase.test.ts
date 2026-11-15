import { describe, expect, it } from 'vitest';
import { observe } from '../src/observe';
import { playRandomGame } from './helpers';

describe('game phase', () => {
  it('always matches the hand in progress until the game is over', () => {
    const { states } = playRandomGame('phase-sync', undefined, { keepStates: true });
    const seen = new Set<string>();
    for (const state of states) {
      if (state.phase === 'game-over') continue;
      expect(state.phase).toBe(state.hand?.phase);
      expect(observe(state, 0).phase).toBe(state.hand?.phase);
      seen.add(state.phase);
    }
    for (const p of ['misdeal-window', 'bidding', 'discarding', 'naming-trump', 'playing']) {
      expect(seen.has(p)).toBe(true);
    }
  });
});
