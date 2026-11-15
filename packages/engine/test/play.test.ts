import { describe, expect, it } from 'vitest';
import { legalMoves } from '../src/legal';
import { applyAction } from '../src/reducer';
import { c, cards, play, playingState } from './helpers';

const RED_TRUMP = 'red' as const;

describe('leading', () => {
  it('lets the leader play any card except the Bull or Bear', () => {
    const state = playingState({
      hands: [cards('R1', 'Y40k', 'T', 'BU'), cards('R2'), cards('R3'), cards('R4')],
      trump: RED_TRUMP,
      leader: 0,
    });
    expect(legalMoves(state, 0)).toEqual({ kind: 'play', cardIds: cards('R1', 'Y40k', 'T') });
    expect(applyAction(state, 0, { type: 'playCard', cardId: c('BU') })).toMatchObject({
      ok: false,
      error: { code: 'CANNOT_LEAD_SPECIAL' },
    });
  });

  it('allows the Bull or Bear to be led only when they are the last cards held', () => {
    const state = playingState({
      hands: [cards('BU', 'BE'), cards('R2', 'R9'), cards('R3', 'Y1'), cards('R4', 'G1')],
      trump: RED_TRUMP,
      leader: 0,
    });
    expect(legalMoves(state, 0)).toEqual({ kind: 'play', cardIds: cards('BU', 'BE') });
  });

  it('the first card that is not the Bull or Bear sets the suit to follow', () => {
    let state = playingState({
      hands: [cards('BU'), cards('R2', 'Y9'), cards('R3', 'Y1'), cards('R4', 'Y40k')],
      trump: RED_TRUMP,
      leader: 0,
    });
    state = play(state, 0, 'BU');
    expect(state.hand?.currentTrick?.suit).toBeNull();
    // No suit yet, so seat 1 may play anything.
    expect(legalMoves(state, 1)).toEqual({ kind: 'play', cardIds: cards('R2', 'Y9') });
    state = play(state, 1, 'Y9');
    expect(state.hand?.currentTrick?.suit).toBe('yellow');
    // Now yellow must be followed.
    expect(legalMoves(state, 2)).toEqual({ kind: 'play', cardIds: cards('Y1') });
    expect(legalMoves(play(state, 2, 'Y1'), 3)).toEqual({ kind: 'play', cardIds: cards('Y40k') });
  });
});

describe('following suit', () => {
  it('requires following the led colour when able', () => {
    let state = playingState({
      hands: [cards('Y9'), cards('Y2', 'R40k', 'T'), cards('Y1'), cards('Y3')],
      trump: RED_TRUMP,
      leader: 0,
    });
    state = play(state, 0, 'Y9');
    expect(legalMoves(state, 1)).toEqual({ kind: 'play', cardIds: cards('Y2') });
    expect(applyAction(state, 1, { type: 'playCard', cardId: c('R40k') })).toMatchObject({
      ok: false,
      error: { code: 'MUST_FOLLOW_SUIT' },
    });
    expect(applyAction(state, 1, { type: 'playCard', cardId: c('T') })).toMatchObject({
      ok: false,
      error: { code: 'MUST_FOLLOW_SUIT' },
    });
  });

  it('lets a player void in the led colour play any card: number, Money, trump, Tiger, Bull or Bear', () => {
    let state = playingState({
      hands: [cards('Y9'), cards('G1', 'G40k', 'R2', 'T', 'BU', 'BE'), cards('Y1'), cards('Y3')],
      trump: RED_TRUMP,
      leader: 0,
    });
    state = play(state, 0, 'Y9');
    expect(legalMoves(state, 1)).toEqual({
      kind: 'play',
      cardIds: cards('R2', 'G1', 'G40k', 'T', 'BU', 'BE'),
    });
  });

  it('rejects a card not in hand and plays out of turn', () => {
    const state = playingState({
      hands: [cards('Y9'), cards('Y2'), cards('Y1'), cards('Y3')],
      trump: RED_TRUMP,
      leader: 0,
    });
    expect(applyAction(state, 0, { type: 'playCard', cardId: c('G9') })).toMatchObject({
      ok: false,
      error: { code: 'CARD_NOT_IN_HAND' },
    });
    expect(applyAction(state, 1, { type: 'playCard', cardId: c('Y2') })).toMatchObject({
      ok: false,
      error: { code: 'NOT_YOUR_TURN' },
    });
  });
});

describe('the Tiger', () => {
  it('counts as trump: when trumps are led and it is the only trump held, it must be played', () => {
    let state = playingState({
      hands: [cards('R9'), cards('T', 'Y1', 'G40k'), cards('R1'), cards('R3')],
      trump: RED_TRUMP,
      leader: 0,
    });
    state = play(state, 0, 'R9');
    expect(legalMoves(state, 1)).toEqual({ kind: 'play', cardIds: cards('T') });
  });

  it('when led, compels the others to follow with trump', () => {
    let state = playingState({
      hands: [cards('T'), cards('R2', 'Y40k'), cards('Y1', 'G1'), cards('R4', 'R40k')],
      trump: RED_TRUMP,
      leader: 0,
    });
    state = play(state, 0, 'T');
    expect(state.hand?.currentTrick?.suit).toBe('red');
    expect(legalMoves(state, 1)).toEqual({ kind: 'play', cardIds: cards('R2') });
    state = play(state, 1, 'R2');
    // Seat 2 has no trump and may play anything.
    expect(legalMoves(state, 2)).toEqual({ kind: 'play', cardIds: cards('Y1', 'G1') });
  });

  it('cannot be played out of suit: a holder of the led non-trump colour must follow instead', () => {
    let state = playingState({
      hands: [cards('Y9'), cards('Y3', 'T'), cards('Y1'), cards('Y2')],
      trump: RED_TRUMP,
      leader: 0,
    });
    state = play(state, 0, 'Y9');
    expect(legalMoves(state, 1)).toEqual({ kind: 'play', cardIds: cards('Y3') });
  });

  it('may be played when void in the led colour, and then wins the trick', () => {
    let state = playingState({
      hands: [cards('Y40k'), cards('G1', 'T'), cards('Y1'), cards('Y2')],
      trump: RED_TRUMP,
      leader: 0,
    });
    state = play(state, 0, 'Y40k');
    state = play(state, 1, 'T');
    state = play(state, 2, 'Y1');
    state = play(state, 3, 'Y2');
    expect(state.hand?.tricks[0]?.winner).toBe(1);
  });
});

describe('winning the trick', () => {
  function oneTrick(hands: [string[], string[], string[], string[]], order: string[]) {
    let state = playingState({
      hands: hands.map((h) => cards(...h)) as never,
      trump: RED_TRUMP,
      leader: 0,
    });
    order.forEach((spec, i) => {
      state = play(state, i as 0 | 1 | 2 | 3, spec);
    });
    return state;
  }

  it('goes to the highest card of the suit led when no trump is played', () => {
    const state = oneTrick([['Y9'], ['Y11'], ['Y10k'], ['Y1']], ['Y9', 'Y11', 'Y10k', 'Y1']);
    expect(state.hand?.tricks[0]?.winner).toBe(1); // the 11 outranks the $10k
  });

  it('ranks the $15k above the 11', () => {
    const state = oneTrick([['Y11'], ['Y15k'], ['Y2'], ['Y1']], ['Y11', 'Y15k', 'Y2', 'Y1']);
    expect(state.hand?.tricks[0]?.winner).toBe(1);
  });

  it('ignores high cards of other colours thrown off', () => {
    const state = oneTrick([['Y2'], ['G40k'], ['Y1'], ['B30k']], ['Y2', 'G40k', 'Y1', 'B30k']);
    expect(state.hand?.tricks[0]?.winner).toBe(0);
  });

  it('goes to the highest trump when any trump is played', () => {
    const state = oneTrick([['Y40k'], ['R1'], ['R2'], ['Y1']], ['Y40k', 'R1', 'R2', 'Y1']);
    expect(state.hand?.tricks[0]?.winner).toBe(2);
  });

  it('gives the Tiger victory even over the $40k of trumps', () => {
    const state = oneTrick([['R40k'], ['R1'], ['T'], ['R2']], ['R40k', 'R1', 'T', 'R2']);
    expect(state.hand?.tricks[0]?.winner).toBe(2);
  });

  it('is never won by the Bull or Bear', () => {
    const state = oneTrick([['BU'], ['Y1'], ['BE'], ['Y2']], ['BU', 'Y1', 'BE', 'Y2']);
    expect(state.hand?.tricks[0]?.winner).toBe(3);
  });

  it('the winner leads the next trick', () => {
    let state = playingState({
      hands: [cards('Y9', 'G1'), cards('Y11', 'G2'), cards('Y1', 'G3'), cards('Y2', 'G4')],
      trump: RED_TRUMP,
      leader: 0,
    });
    for (const [seat, spec] of [
      [0, 'Y9'],
      [1, 'Y11'],
      [2, 'Y1'],
      [3, 'Y2'],
    ] as const) {
      state = play(state, seat, spec);
    }
    expect(state.hand?.turn).toBe(1);
    expect(state.hand?.currentTrick).toEqual({ leader: 1, plays: [], suit: null, winner: null });
    expect(state.hand?.tricks).toHaveLength(1);
  });
});
