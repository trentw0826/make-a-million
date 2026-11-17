import { describe, expect, it } from 'vitest';
import { DECK_SIZE, HAND_SIZE, sumMoney, WIDOW_SIZE } from '../src/cards';
import { legalMoves } from '../src/legal';
import { applyAction, createGame } from '../src/reducer';
import { makeRuleset } from '../src/ruleset';
import type { Seat } from '../src/seats';
import { nextSeat, partnerOf, SEATS, teamOf } from '../src/seats';
import type { GameState } from '../src/state';
import { act, allCardsInPlay } from './helpers';

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

  /** Everyone before `seat` raises at the minimum until it is `seat`'s turn. */
  function untilTurn(state: GameState, seat: Seat): GameState {
    let s = state;
    while (s.hand?.auction.turn !== seat) {
      const turn = s.hand?.auction.turn as Seat;
      const moves = legalMoves(s, turn);
      if (moves.kind !== 'bid') throw new Error('the auction ended early');
      s = act(s, turn, { type: 'bid', amount: moves.minBid });
    }
    return s;
  }

  it('is offered only to a player dealt $15,000 or less in Money, on their first turn to bid', () => {
    const { seed, seat } = findSeedWithEligibleSeat();
    let state = createGame({ seed });
    const hand = state.hand;
    if (!hand) throw new Error('no hand');
    expect(sumMoney(hand.hands[seat])).toBeLessThanOrEqual(15_000);
    // Four turns, one per seat, everyone raising.
    for (let i = 0; i < 4; i++) {
      const turn = state.hand?.auction.turn as Seat;
      const moves = legalMoves(state, turn);
      if (moves.kind !== 'bid') throw new Error('not bidding');
      expect(moves.canCallMisdeal).toBe(turn === seat);
      if (turn !== seat) {
        expect(sumMoney(hand.hands[turn])).toBeGreaterThan(15_000);
        expect(applyAction(state, turn, { type: 'callMisdeal' })).toMatchObject({
          ok: false,
          error: { code: 'NOT_ELIGIBLE_FOR_MISDEAL' },
        });
      }
      state = act(state, turn, { type: 'bid', amount: moves.minBid });
    }
  });

  it('cannot be called once the player has bid or passed', () => {
    const { seed, seat } = findSeedWithEligibleSeat();
    const first = untilTurn(createGame({ seed }), seat);
    const moves = legalMoves(first, seat);
    if (moves.kind !== 'bid') throw new Error('not bidding');
    const second = untilTurn(act(first, seat, { type: 'bid', amount: moves.minBid }), seat);
    expect(legalMoves(second, seat)).toMatchObject({ kind: 'bid', canCallMisdeal: false });
    expect(applyAction(second, seat, { type: 'callMisdeal' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_ELIGIBLE_FOR_MISDEAL' },
    });
  });

  it('cannot be called out of turn', () => {
    for (let i = 0; i < 10_000; i++) {
      const state = createGame({ seed: `misdeal-turn-${i}`, dealer: 0 });
      const seat = state.hand?.misdeal.eligible.find((s) => s !== state.hand?.auction.turn);
      if (seat === undefined) continue;
      expect(applyAction(state, seat, { type: 'callMisdeal' })).toMatchObject({
        ok: false,
        error: { code: 'NOT_YOUR_TURN' },
      });
      return;
    }
    throw new Error('no seed found');
  });

  it('voids the auction and re-deals with the same dealer, counting the redeal', () => {
    const { seed, seat } = findSeedWithEligibleSeat(3);
    const before = untilTurn(createGame({ seed, dealer: 3 }), seat);
    const after = act(before, seat, { type: 'callMisdeal' });
    expect(after.hand?.dealer).toBe(3);
    expect(after.hand?.handNumber).toBe(1);
    expect(after.hand?.redeals).toBe(1);
    expect(after.hand?.phase).toBe('bidding');
    expect(after.hand?.auction.entries).toEqual([]);
    expect(after.hand?.auction.turn).toBe(nextSeat(3));
    expect(after.hand?.hands).not.toEqual(before.hand?.hands);
  });

  it('leaves bidding to open as soon as the cards are dealt', () => {
    const state = createGame({ seed: 'ready', dealer: 0 });
    expect(state.phase).toBe('bidding');
    expect(state.hand?.phase).toBe('bidding');
    expect(state.hand?.turn).toBe(1);
    expect(legalMoves(state, 1).kind).toBe('bid');
  });

  it('can be disabled by the ruleset, in which case nobody is offered it', () => {
    const ruleset = makeRuleset({ misdeal: { enabled: false, threshold: 400_000 } });
    const state = createGame({ seed: 'no-misdeal', ruleset });
    expect(state.hand?.misdeal.eligible).toEqual([]);
    expect(legalMoves(state, 1)).toMatchObject({ kind: 'bid', canCallMisdeal: false });
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
