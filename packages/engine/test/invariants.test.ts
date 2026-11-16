import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { assertInvariants, InvariantViolation } from '../src/invariants';
import { DEFAULT_RULESET, makeRuleset } from '../src/ruleset';
import type { Contract, GameState, HandState, Trick } from '../src/state';
import { openingLeader } from '../src/tricks';
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
      expect(result.tricks[0]?.leader).toBe(openingLeader(result.bidder));
      const captured: [number, number] = [0, 0];
      for (const t of result.tricks) captured[(t.winner % 2) as 0 | 1] += t.value;
      expect(result.captured).toEqual(captured);
      const bt = result.biddingTeam;
      expect(result.made).toBe(captured[bt] >= result.bid);
      expect(result.delta[bt]).toBe(result.made ? captured[bt] : -result.bid);
      expect(result.delta[1 - bt]).toBe(captured[1 - bt]);
    });
  });

  it('reject a first trick led by anyone but the player to the left of the bidder', () => {
    const { states } = playRandomGame('opening lead', DEFAULT_RULESET, { keepStates: true });
    const opening = states.find((s) => s.hand?.phase === 'playing') as GameState;
    const hand = opening.hand as HandState;
    const bidder = (hand.contract as Contract).bidder;
    expect(hand.turn).toBe(openingLeader(bidder));
    expect(() => assertInvariants(opening)).not.toThrow();
    const bidderLeads: GameState = {
      ...opening,
      hand: {
        ...hand,
        turn: bidder,
        currentTrick: { ...(hand.currentTrick as Trick), leader: bidder },
      },
    };
    expect(() => assertInvariants(bidderLeads)).toThrow(InvariantViolation);
  });
});
