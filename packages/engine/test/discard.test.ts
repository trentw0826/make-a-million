import { describe, expect, it } from 'vitest';
import { sumMoney, TOTAL_MONEY } from '../src/cards';
import { legalMoves } from '../src/legal';
import { applyAction } from '../src/reducer';
import { act, allCardsInPlay, c, cards, discardingState } from './helpers';

// A 16-card bidder hand with plenty of number cards.
const RICH_IN_NUMBERS = cards(
  'R40k',
  'R30k',
  'R15k',
  'R11',
  'R9',
  'R8',
  'Y7',
  'Y4',
  'Y3',
  'B2',
  'B1',
  'G10k',
  'G5k',
  'T',
  'BU',
  'BE',
);

// A 16-card bidder hand with only one number card.
const ONE_NUMBER = cards(
  'R40k',
  'R30k',
  'R15k',
  'R10k',
  'R5k',
  'Y40k',
  'Y30k',
  'Y15k',
  'Y10k',
  'Y5k',
  'B40k',
  'B30k',
  'B15k',
  'G40k',
  'G11',
  'T',
);

describe('discarding after picking up the widow', () => {
  it('requires exactly three distinct cards from hand', () => {
    const state = discardingState(1, RICH_IN_NUMBERS);
    expect(applyAction(state, 1, { type: 'discard', cardIds: cards('R9', 'R8') })).toMatchObject({
      ok: false,
      error: { code: 'DISCARD_COUNT' },
    });
    expect(
      applyAction(state, 1, { type: 'discard', cardIds: cards('R9', 'R9', 'R8') }),
    ).toMatchObject({
      ok: false,
      error: { code: 'DISCARD_DUPLICATE' },
    });
    expect(
      applyAction(state, 1, { type: 'discard', cardIds: cards('R9', 'R8', 'G1') }),
    ).toMatchObject({
      ok: false,
      error: { code: 'DISCARD_NOT_IN_HAND' },
    });
  });

  it('never allows the Tiger, Bull or Bear to be discarded', () => {
    const state = discardingState(1, RICH_IN_NUMBERS);
    for (const special of ['T', 'BU', 'BE']) {
      expect(
        applyAction(state, 1, { type: 'discard', cardIds: cards('R9', 'R8', special) }),
      ).toMatchObject({
        ok: false,
        error: { code: 'DISCARD_SPECIAL' },
      });
    }
    expect(legalMoves(state, 1)).toMatchObject({ forbiddenIds: cards('T', 'BU', 'BE') });
  });

  it('forbids discarding a Money card while any number card could be discarded', () => {
    const state = discardingState(1, RICH_IN_NUMBERS);
    expect(legalMoves(state, 1)).toMatchObject({ kind: 'discard', requiredNumberCards: 3 });
    expect(
      applyAction(state, 1, { type: 'discard', cardIds: cards('R9', 'R8', 'G5k') }),
    ).toMatchObject({
      ok: false,
      error: { code: 'DISCARD_MONEY_WHILE_NUMBERS' },
    });
    const after = act(state, 1, { type: 'discard', cardIds: cards('R9', 'R8', 'B1') });
    expect(after.hand?.hands[1]).toHaveLength(13);
    expect(after.hand?.discards).toEqual(cards('R9', 'R8', 'B1'));
    expect(after.hand?.phase).toBe('naming-trump');
    expect(after.hand?.turn).toBe(1);
  });

  it('with fewer than three number cards, all of them plus Money cards must go', () => {
    const state = discardingState(1, ONE_NUMBER);
    expect(legalMoves(state, 1)).toMatchObject({ kind: 'discard', requiredNumberCards: 1 });
    expect(
      applyAction(state, 1, { type: 'discard', cardIds: cards('R5k', 'Y5k', 'G40k') }),
    ).toMatchObject({
      ok: false,
      error: { code: 'DISCARD_MONEY_WHILE_NUMBERS' },
    });
    const after = act(state, 1, { type: 'discard', cardIds: cards('G11', 'R5k', 'Y5k') });
    expect(after.hand?.hands[1]).toHaveLength(13);
  });

  it('keeps discarded Money out of play for the rest of the hand', () => {
    const state = discardingState(1, ONE_NUMBER);
    const after = act(state, 1, { type: 'discard', cardIds: cards('G11', 'R5k', 'Y5k') });
    const inHands = after.hand?.hands.flat() ?? [];
    expect(inHands).not.toContain(c('R5k'));
    expect(inHands).not.toContain(c('Y5k'));
    // Discards are still accounted for, so the deck's money is conserved.
    expect(allCardsInPlay(after)).toContain(c('R5k'));
    expect(sumMoney(after.hand?.discards ?? [])).toBe(10_000);
    expect(sumMoney(inHands) + sumMoney(after.hand?.discards ?? [])).toBe(sumMoney(ONE_NUMBER));
    void TOTAL_MONEY;
  });

  it('only the bidder may discard, and only during the discard phase', () => {
    const state = discardingState(1, RICH_IN_NUMBERS);
    expect(
      applyAction(state, 2, { type: 'discard', cardIds: cards('R9', 'R8', 'B1') }),
    ).toMatchObject({
      ok: false,
      error: { code: 'NOT_YOUR_TURN' },
    });
    expect(applyAction(state, 1, { type: 'nameTrump', suit: 'red' })).toMatchObject({
      ok: false,
      error: { code: 'WRONG_PHASE' },
    });
  });

  it('is followed by the bidder naming trump, after which the bidder leads', () => {
    const state = act(discardingState(1, RICH_IN_NUMBERS), 1, {
      type: 'discard',
      cardIds: cards('R9', 'R8', 'B1'),
    });
    expect(legalMoves(state, 1)).toEqual({
      kind: 'trump',
      suits: ['red', 'yellow', 'black', 'green'],
    });
    expect(applyAction(state, 1, { type: 'nameTrump', suit: 'purple' as never })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_TRUMP' },
    });
    const playing = act(state, 1, { type: 'nameTrump', suit: 'green' });
    expect(playing.hand?.trump).toBe('green');
    expect(playing.hand?.phase).toBe('playing');
    expect(playing.hand?.turn).toBe(1);
    expect(playing.hand?.currentTrick).toEqual({ leader: 1, plays: [], suit: null, winner: null });
  });
});
