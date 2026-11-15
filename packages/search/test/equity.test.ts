import {
  applyActionOrThrow,
  cardById,
  createGame,
  DEFAULT_RULESET,
  isMoney,
  isNumberCard,
  legalMoves,
  Rng,
  SEATS,
} from '@mam/engine';
import { describe, expect, it } from 'vitest';
import {
  captureUtility,
  type HandContext,
  handOutcome,
  lookupEquity,
  type MatchEquityTable,
  ME_TABLE,
} from '../src/index';

const tiny: MatchEquityTable = {
  version: 1,
  source: 'test',
  target: 1_000_000,
  min: 0,
  step: 100,
  size: 2,
  // d=0: [[0.5, 0.2], [0.8, 0.5]]; d=1: [[0.6, 0.3], [0.9, 0.6]]
  values: [0.5, 0.2, 0.8, 0.5, 0.6, 0.3, 0.9, 0.6],
};

describe('lookupEquity', () => {
  it('reads grid points and interpolates between them', () => {
    expect(lookupEquity(tiny, 0, 0, false)).toBeCloseTo(0.5);
    expect(lookupEquity(tiny, 100, 0, false)).toBeCloseTo(0.8);
    expect(lookupEquity(tiny, 0, 100, true)).toBeCloseTo(0.3);
    expect(lookupEquity(tiny, 50, 50, false)).toBeCloseTo((0.5 + 0.2 + 0.8 + 0.5) / 4);
  });

  it('clamps outside the grid', () => {
    expect(lookupEquity(tiny, -1e6, 0, false)).toBeCloseTo(0.5);
    expect(lookupEquity(tiny, 1e6, 0, false)).toBeCloseTo(0.8);
  });
});

describe('generated match-equity table', () => {
  const at = (own: number, opp: number, deals: boolean) => lookupEquity(ME_TABLE, own, opp, deals);

  it('is complementary between the two teams', () => {
    for (const [a, b] of [
      [0, 0],
      [300_000, 100_000],
      [-200_000, 800_000],
      [900_000, 950_000],
    ] as const) {
      expect(at(a, b, true) + at(b, a, false)).toBeCloseTo(1, 3);
    }
  });

  it('rises with own score and falls with the opponents’ score', () => {
    for (let own = -400_000; own < 1_000_000; own += 50_000) {
      expect(at(own + 50_000, 300_000, false)).toBeGreaterThanOrEqual(at(own, 300_000, false));
      expect(at(300_000, own + 50_000, false)).toBeLessThanOrEqual(at(300_000, own, false));
    }
  });
});

describe('handOutcome', () => {
  it('scores hands exactly like the engine', () => {
    const rng = Rng.fromSeed('outcome');
    for (let g = 0; g < 5; g++) {
      let state = createGame({ seed: `outcome-${g}` });
      let before: readonly [number, number] = [0, 0];
      while (state.phase !== 'game-over') {
        const seat = SEATS.find((s) => legalMoves(state, s).kind !== 'none');
        if (seat === undefined) throw new Error('stuck');
        const legal = legalMoves(state, seat);
        const hand = state.hand?.hands[seat] ?? [];
        const action =
          legal.kind === 'misdeal'
            ? ({ type: 'declineMisdeal' } as const)
            : legal.kind === 'bid'
              ? legal.canPass
                ? ({ type: 'pass' } as const)
                : ({ type: 'bid', amount: legal.minBid } as const)
              : legal.kind === 'discard'
                ? ({
                    type: 'discard',
                    cardIds: [
                      ...hand.filter((id) => isNumberCard(cardById(id))),
                      ...hand.filter((id) => isMoney(cardById(id))),
                    ].slice(0, 3),
                  } as const)
                : legal.kind === 'trump'
                  ? ({ type: 'nameTrump', suit: rng.pick(legal.suits) } as const)
                  : legal.kind === 'play'
                    ? ({ type: 'playCard', cardId: rng.pick(legal.cardIds) } as const)
                    : ({ type: 'continue' } as const);
        state = applyActionOrThrow(state, seat, action).state;
        const r = state.hand?.result;
        if (r && state.handHistory.length > 0 && r === state.handHistory.at(-1)) {
          const ctx: HandContext = {
            ruleset: DEFAULT_RULESET,
            scores: before,
            dealer: r.dealer,
            bidder: r.bidder,
            bid: r.bid,
          };
          const out = handOutcome(ctx, r.captured);
          expect(out.scoresAfter).toEqual(r.scoresAfter);
          expect(out.made).toBe(r.made);
          before = r.scoresAfter;
          if (state.phase === 'hand-complete') {
            state = applyActionOrThrow(state, 0, { type: 'continue' }).state;
          }
        }
      }
    }
  });
});

describe('captureUtility', () => {
  const ctx: HandContext = {
    ruleset: DEFAULT_RULESET,
    scores: [900_000, 500_000],
    dealer: 3,
    bidder: 0,
    bid: 200_000,
  };

  it('values a game-winning hand at 1 and the opponents at 0', () => {
    expect(captureUtility(ctx, 0, 'equity', ME_TABLE)([250_000, 100_000])).toBe(1);
    expect(captureUtility(ctx, 1, 'equity', ME_TABLE)([250_000, 100_000])).toBe(0);
  });

  it('is complementary between teams when the game goes on', () => {
    const u0 = captureUtility(ctx, 0, 'equity', ME_TABLE)([150_000, 200_000]);
    const u1 = captureUtility(ctx, 1, 'equity', ME_TABLE)([150_000, 200_000]);
    expect(u0 + u1).toBeCloseTo(1, 3);
  });

  it('jumps at the contract threshold', () => {
    const u = captureUtility(ctx, 0, 'equity', ME_TABLE);
    expect(u([200_000, 150_000]) - u([195_000, 155_000])).toBeGreaterThan(0.2);
  });

  it('has a points mode that needs no table', () => {
    const u = captureUtility(ctx, 0, 'margin', null);
    expect(u([200_000, 150_000])).toBeCloseTo((200_000 - 150_000) / 100_000);
    expect(u([150_000, 150_000])).toBeCloseTo((-200_000 - 150_000) / 100_000);
  });
});
