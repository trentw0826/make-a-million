import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRuleset } from '../src/ruleset';
import { playRandomGame } from './helpers';

describe('random games', () => {
  it('always finish, and every reachable state satisfies the invariants', () => {
    fc.assert(
      fc.property(fc.nat({ max: 1_000_000 }), (seed) => {
        const { state } = playRandomGame(seed);
        expect(state.phase).toBe('game-over');
        expect(state.winner).not.toBeNull();
        const winner = state.winner as 0 | 1;
        expect(state.scores[winner]).toBeGreaterThanOrEqual(state.ruleset.targetScore);
      }),
      { numRuns: 40 },
    );
  }, 60_000);

  it('hold under house-rule variants', () => {
    const variants = [
      makeRuleset({ bidding: { raiseIncrement: 5_000 } }),
      makeRuleset({ bidding: { openerMustBid: false } }),
      makeRuleset({ misdeal: { enabled: false } }),
      makeRuleset({ targetScore: 300_000, tieBreak: 'play-on' }),
    ];
    for (const [i, ruleset] of variants.entries()) {
      for (let seed = 0; seed < 8; seed++) {
        const { state } = playRandomGame(`variant-${i}-${seed}`, ruleset);
        expect(state.phase).toBe('game-over');
      }
    }
  });

  it('produce a consistent score sheet', () => {
    const { state } = playRandomGame('sheet');
    expect(state.handHistory.length).toBeGreaterThan(0);
    state.handHistory.forEach((result, i) => {
      expect(result.handNumber).toBe(i + 1);
      expect(result.tricks).toHaveLength(13);
      const captured: [number, number] = [0, 0];
      for (const t of result.tricks) captured[(t.winner % 2) as 0 | 1] += t.value;
      expect(result.captured).toEqual(captured);
      const bt = result.biddingTeam;
      expect(result.made).toBe(captured[bt] >= result.bid);
      expect(result.delta[bt]).toBe(result.made ? captured[bt] : -result.bid);
      expect(result.delta[1 - bt]).toBe(captured[1 - bt]);
    });
  });
});
