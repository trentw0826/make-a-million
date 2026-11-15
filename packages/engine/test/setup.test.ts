import { describe, expect, it } from 'vitest';
import { DECK_SIZE, HAND_SIZE, sumMoney, WIDOW_SIZE } from '../src/cards';
import { legalMoves } from '../src/legal';
import { applyAction, createGame } from '../src/reducer';
import { makeRuleset } from '../src/ruleset';
import { nextSeat, partnerOf, SEATS, teamOf } from '../src/seats';
import { act, allCardsInPlay, readyAll } from './helpers';

describe('partnerships', () => {
  it('seats opposite each other are partners', () => {
    expect(partnerOf(0)).toBe(2);
    expect(partnerOf(1)).toBe(3);
    expect(teamOf(0)).toBe(teamOf(2));
    expect(teamOf(1)).toBe(teamOf(3));
    expect(teamOf(0)).not.toBe(teamOf(1));
  });
});

describe('dealing', () => {
  it('deals thirteen cards to each player and leaves a three-card widow', () => {
    const state = createGame({ seed: 'deal' });
    const hand = state.hand;
    if (!hand) throw new Error('no hand');
    for (const seat of SEATS) expect(hand.hands[seat]).toHaveLength(HAND_SIZE);
    expect(hand.widow).toHaveLength(WIDOW_SIZE);
    const all = allCardsInPlay(state);
    expect(all).toHaveLength(DECK_SIZE);
    expect(new Set(all).size).toBe(DECK_SIZE);
  });

  it('is reproducible from the seed', () => {
    expect(createGame({ seed: 'same' })).toEqual(createGame({ seed: 'same' }));
    expect(createGame({ seed: 'same' }).hand?.hands).not.toEqual(
      createGame({ seed: 'different' }).hand?.hands,
    );
  });

  it('passes the deal clockwise after each hand', () => {
    const state = createGame({ seed: 'dealer', dealer: 2 });
    expect(state.hand?.dealer).toBe(2);
    expect(state.hand?.auction.turn).toBe(nextSeat(2));
  });
});

describe('misdeal', () => {
  function findSeedWithEligibleSeat(dealer: 0 | 1 | 2 | 3 = 0): {
    seed: string;
    seat: 0 | 1 | 2 | 3;
  } {
    for (let i = 0; i < 10_000; i++) {
      const seed = `misdeal-${i}`;
      const state = createGame({ seed, dealer });
      const eligible = state.hand?.misdeal.eligible ?? [];
      if (eligible.length === 1 && eligible[0] !== undefined) return { seed, seat: eligible[0] };
    }
    throw new Error('no seed found');
  }

  it('is available only to a player dealt $15,000 or less in Money', () => {
    const { seed, seat } = findSeedWithEligibleSeat();
    const state = createGame({ seed });
    const hand = state.hand;
    if (!hand) throw new Error('no hand');
    expect(sumMoney(hand.hands[seat])).toBeLessThanOrEqual(15_000);
    for (const other of SEATS.filter((s) => s !== seat)) {
      expect(sumMoney(hand.hands[other])).toBeGreaterThan(15_000);
      expect(legalMoves(state, other)).toEqual({ kind: 'misdeal', canCall: false });
      expect(applyAction(state, other, { type: 'callMisdeal' })).toMatchObject({
        ok: false,
        error: { code: 'NOT_ELIGIBLE_FOR_MISDEAL' },
      });
    }
    expect(legalMoves(state, seat)).toEqual({ kind: 'misdeal', canCall: true });
  });

  it('re-deals with the same dealer and counts the redeal', () => {
    const { seed, seat } = findSeedWithEligibleSeat(3);
    const before = createGame({ seed, dealer: 3 });
    const after = act(before, seat, { type: 'callMisdeal' });
    expect(after.hand?.dealer).toBe(3);
    expect(after.hand?.handNumber).toBe(1);
    expect(after.hand?.redeals).toBe(1);
    expect(after.hand?.phase).toBe('misdeal-window');
    expect(after.hand?.hands).not.toEqual(before.hand?.hands);
    expect(after.hand?.misdeal.pending).toEqual([0, 1, 2, 3]);
  });

  it('must be called before bidding begins: every seat confirms, then bidding opens', () => {
    const state = createGame({ seed: 'ready', dealer: 0 });
    expect(state.hand?.misdeal.pending).toEqual([0, 1, 2, 3]);
    const partly = act(act(state, 2, { type: 'declineMisdeal' }), 0, { type: 'declineMisdeal' });
    expect(partly.hand?.phase).toBe('misdeal-window');
    expect(partly.hand?.misdeal.pending).toEqual([1, 3]);
    expect(applyAction(partly, 2, { type: 'declineMisdeal' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_YOUR_TURN' },
    });
    const bidding = readyAll(partly);
    expect(bidding.hand?.phase).toBe('bidding');
    expect(bidding.hand?.turn).toBe(1);
    expect(applyAction(bidding, 1, { type: 'callMisdeal' })).toMatchObject({
      ok: false,
      error: { code: 'WRONG_PHASE' },
    });
  });

  it('can be disabled by the ruleset, in which case bidding opens immediately', () => {
    const ruleset = makeRuleset({ misdeal: { enabled: false } });
    const state = createGame({ seed: 'no-misdeal', ruleset });
    expect(state.hand?.phase).toBe('bidding');
    expect(state.hand?.misdeal.pending).toEqual([]);
  });

  it('respects a different threshold', () => {
    const generous = createGame({
      seed: 'threshold',
      ruleset: makeRuleset({ misdeal: { threshold: 400_000 } }),
    });
    expect(generous.hand?.misdeal.eligible).toEqual([0, 1, 2, 3]);
    const strict = createGame({
      seed: 'threshold',
      ruleset: makeRuleset({ misdeal: { threshold: -1 } }),
    });
    expect(strict.hand?.misdeal.eligible).toEqual([]);
  });
});
