import { describe, expect, it } from 'vitest';
import { legalMoves } from '../src/legal';
import { applyAction, createGame } from '../src/reducer';
import { makeRuleset } from '../src/ruleset';
import { act, readyAll } from './helpers';

function openAuction(seed = 'auction', dealer: 0 | 1 | 2 | 3 = 0) {
  return readyAll(createGame({ seed, dealer }));
}

describe('bidding', () => {
  it('begins with the player to the left of the dealer', () => {
    const state = openAuction('left', 2);
    expect(state.hand?.turn).toBe(3);
    expect(legalMoves(state, 3).kind).toBe('bid');
    expect(legalMoves(state, 0).kind).toBe('none');
  });

  it('requires the opener to bid rather than pass', () => {
    const state = openAuction();
    expect(legalMoves(state, 1)).toEqual({
      kind: 'bid',
      minBid: 175_000,
      step: 5_000,
      canPass: false,
    });
    expect(applyAction(state, 1, { type: 'pass' })).toMatchObject({
      ok: false,
      error: { code: 'MUST_OPEN' },
    });
  });

  it('has a minimum opening bid of $175,000', () => {
    const state = openAuction();
    expect(applyAction(state, 1, { type: 'bid', amount: 170_000 })).toMatchObject({
      ok: false,
      error: { code: 'BID_TOO_LOW' },
    });
    expect(applyAction(state, 1, { type: 'bid', amount: 175_000 }).ok).toBe(true);
    expect(applyAction(state, 1, { type: 'bid', amount: 200_000 }).ok).toBe(true);
  });

  it('requires bids to be multiples of the bid step', () => {
    const state = openAuction();
    expect(applyAction(state, 1, { type: 'bid', amount: 177_000 })).toMatchObject({
      ok: false,
      error: { code: 'BID_NOT_MULTIPLE' },
    });
  });

  it('requires each raise to exceed the previous bid by at least $10,000', () => {
    const state = act(openAuction(), 1, { type: 'bid', amount: 175_000 });
    expect(legalMoves(state, 2)).toEqual({
      kind: 'bid',
      minBid: 185_000,
      step: 5_000,
      canPass: true,
    });
    expect(applyAction(state, 2, { type: 'bid', amount: 180_000 })).toMatchObject({
      ok: false,
      error: { code: 'BID_TOO_LOW' },
    });
    expect(applyAction(state, 2, { type: 'bid', amount: 185_000 }).ok).toBe(true);
  });

  it('supports the $5,000 raise house rule', () => {
    const ruleset = makeRuleset({ bidding: { raiseIncrement: 5_000 } });
    let state = readyAll(createGame({ seed: 'house', ruleset }));
    state = act(state, 1, { type: 'bid', amount: 175_000 });
    expect(legalMoves(state, 2)).toMatchObject({ minBid: 180_000 });
  });

  it('has no maximum bid', () => {
    const state = openAuction();
    expect(applyAction(state, 1, { type: 'bid', amount: 5_000_000 }).ok).toBe(true);
  });

  it('rejects bids out of turn', () => {
    const state = openAuction();
    expect(applyAction(state, 2, { type: 'bid', amount: 175_000 })).toMatchObject({
      ok: false,
      error: { code: 'NOT_YOUR_TURN' },
    });
  });

  it('skips players who have passed; a pass is final', () => {
    let state = openAuction();
    state = act(state, 1, { type: 'bid', amount: 175_000 });
    state = act(state, 2, { type: 'pass' });
    state = act(state, 3, { type: 'bid', amount: 185_000 });
    state = act(state, 0, { type: 'pass' });
    expect(state.hand?.turn).toBe(1);
    state = act(state, 1, { type: 'bid', amount: 195_000 });
    // Seat 2 and 0 have passed, so the turn goes straight to seat 3.
    expect(state.hand?.turn).toBe(3);
    expect(legalMoves(state, 2).kind).toBe('none');
  });

  it('ends when all but one player have passed; the high bid becomes the contract', () => {
    let state = openAuction();
    state = act(state, 1, { type: 'bid', amount: 175_000 });
    state = act(state, 2, { type: 'pass' });
    state = act(state, 3, { type: 'bid', amount: 185_000 });
    state = act(state, 0, { type: 'pass' });
    expect(state.hand?.phase).toBe('bidding');
    state = act(state, 1, { type: 'pass' });
    expect(state.hand?.phase).toBe('discarding');
    expect(state.hand?.contract).toEqual({ bidder: 3, amount: 185_000 });
    expect(state.hand?.auction.entries).toHaveLength(5);
  });

  it('gives the widow to the high bidder, who then holds sixteen cards', () => {
    let state = openAuction();
    const widow = state.hand?.widow ?? [];
    state = act(state, 1, { type: 'bid', amount: 175_000 });
    state = act(state, 2, { type: 'pass' });
    state = act(state, 3, { type: 'pass' });
    state = act(state, 0, { type: 'pass' });
    expect(state.hand?.hands[1]).toHaveLength(16);
    for (const id of widow) expect(state.hand?.hands[1]).toContain(id);
    expect(state.hand?.turn).toBe(1);
    expect(legalMoves(state, 1).kind).toBe('discard');
    expect(legalMoves(state, 2).kind).toBe('none');
  });

  it('with the opener allowed to pass, a hand everyone passes is thrown in and redealt by the next dealer', () => {
    const ruleset = makeRuleset({ bidding: { openerMustBid: false } });
    let state = readyAll(createGame({ seed: 'pass-out', ruleset, dealer: 0 }));
    expect(legalMoves(state, 1)).toMatchObject({ canPass: true });
    for (const seat of [1, 2, 3, 0] as const) state = act(state, seat, { type: 'pass' });
    expect(state.hand?.dealer).toBe(1);
    expect(state.hand?.handNumber).toBe(1);
    expect(state.hand?.phase).toBe('misdeal-window');
  });
});
