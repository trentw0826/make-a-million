import { createGame, type Seat, SUITS } from '@mam/engine';
import { describe, expect, it } from 'vitest';
import { heuristicContract } from '../src/contract/simulate';
import { CONTRACT_FEATURE_COUNT, CONTRACT_FEATURES, contractFeatures } from '../src/contract/value';

const MONEY_K = [0, 0, 0, 0, 5, 0, 0, 0, 10, 0, 15, 30, 40];
const at = (name: (typeof CONTRACT_FEATURES)[number], x: Float64Array) =>
  x[CONTRACT_FEATURES.indexOf(name)] as number;

describe('contract features', () => {
  it('describe the declaring team and its opponents consistently', () => {
    for (let i = 0; i < 20; i++) {
      const hand = createGame({ seed: `features-${i}` }).hand;
      if (!hand) throw new Error('no hand');
      const deal = { hands: hand.hands, widow: hand.widow };
      const declarer = (i % 4) as Seat;
      const x = contractFeatures(deal, declarer);
      expect(x).toHaveLength(CONTRACT_FEATURE_COUNT);
      expect([...x].every(Number.isFinite)).toBe(true);
      expect(at('bias', x)).toBe(1);
      const { keep, trump } = heuristicContract([...(hand.hands[declarer] ?? []), ...hand.widow]);
      const discarded = [...(hand.hands[declarer] ?? []), ...hand.widow].filter(
        (c) => !keep.includes(c),
      );
      const money =
        at('money declarer', x) +
        at('money partner', x) +
        at('money left (leads)', x) +
        at('money right', x);
      const discardMoney = discarded.reduce(
        (m, c) => m + (c < 52 ? (MONEY_K[c % 13] as number) : 0),
        0,
      );
      expect(money).toBe(400 - discardMoney);
      const t = SUITS.indexOf(trump);
      const trumps =
        at('trumps declarer', x) +
        at('trumps partner', x) +
        at('trumps left', x) +
        at('trumps right', x);
      expect(trumps).toBe(13 - discarded.filter((c) => c < 52 && Math.floor(c / 13) === t).length);
      // Every special is in some hand: ours or theirs.
      expect(at('bull ours', x) + at('bull theirs', x)).toBe(1);
      expect(at('bear ours', x) + at('bear theirs', x)).toBe(1);
      expect(at('estimate', x)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('bidding with the contract-value model', () => {
  const PLACEHOLDER = {
    source: 'test',
    features: [...CONTRACT_FEATURES],
    weights: CONTRACT_FEATURES.map((f) => (f === 'bias' ? 130 : f === 'estimate' ? 0.5 : 0)),
    sd: 58,
  };

  it('reproduces the calibrated playout when the model is that calibration', async () => {
    const { calibrated, modelValue } = await import('../src/contract/index');
    const { playoutDeclare } = await import('../src/contract/simulate');
    const { teamOf } = await import('@mam/engine');
    for (let i = 0; i < 12; i++) {
      const hand = createGame({ seed: `model-same-${i}` }).hand;
      if (!hand) throw new Error('no hand');
      const deal = { hands: hand.hands, widow: hand.widow };
      const declarer = (i % 4) as Seat;
      // Any utility of the captures will do: a step at a made contract plus a slope.
      const u = (c: readonly [number, number]) => (c[0] >= 185 ? 1 : 0) + c[0] / 1000 - c[1] / 2000;
      const a = calibrated(u, teamOf(declarer), { calibA: 130, calibB: 0.5, calibSd: 58 })(
        playoutDeclare(deal, declarer),
      );
      expect(modelValue(deal, declarer, u, PLACEHOLDER)).toBeCloseTo(a, 12);
    }
  });

  it('decides from the observation alone (hidden cards reshuffled: same evaluation)', async () => {
    const { evaluateBid, CONTRACT_DEFAULTS } = await import('../src/contract/index');
    const { HardBot, HARD_DEFAULTS } = await import('../src/hard/index');
    const { observe, Rng } = await import('@mam/engine');
    const opts = { ...CONTRACT_DEFAULTS, bidWorlds: 24, contractValue: 'model' as const };
    let checked = 0;
    for (let i = 0; i < 8; i++) {
      const state = createGame({ seed: `model-leak-${i}` });
      const hand = state.hand;
      if (!hand) throw new Error('no hand');
      const seat = hand.auction.turn;
      // Swap the other seats' hands and the widow around: the seat sees exactly the same.
      const others = ([0, 1, 2, 3] as Seat[]).filter((s) => s !== seat);
      const [a, b, c] = others as [Seat, Seat, Seat];
      const hands = [...hand.hands] as unknown as (typeof hand)['hands'];
      const pool = [...hand.hands[a], ...hand.hands[b], ...hand.hands[c], ...hand.widow].reverse();
      const moved = [...hand.hands] as number[][];
      moved[a] = pool.slice(0, 13);
      moved[b] = pool.slice(13, 26);
      moved[c] = pool.slice(26, 39);
      const swapped = {
        ...state,
        hand: { ...hand, hands: moved as unknown as typeof hands, widow: pool.slice(39) },
      };
      const o1 = observe(state, seat);
      const o2 = observe(swapped, seat);
      expect(o2).toEqual(o1);
      const e1 = evaluateBid(o1, Rng.fromSeed('leak'), opts);
      const e2 = evaluateBid(o2, Rng.fromSeed('leak'), opts);
      expect(e2).toEqual(e1);
      const bot = new HardBot({ ...HARD_DEFAULTS, bidWorlds: 24, contractValue: 'model' });
      expect(bot.decide(o2, Rng.fromSeed('d'))).toEqual(bot.decide(o1, Rng.fromSeed('d')));
      checked += 1;
    }
    expect(checked).toBe(8);
  });
});

describe('the fitted model of the other bidders', () => {
  it('with the placeholder model, gives the heuristic ceilings and scale', async () => {
    const { fittedCeiling, fittedSigma } = await import('../src/contract/auction');
    const { AUCTION_MODEL } = await import('../src/contract/generated/auctionModel');
    const { ceilingForHand } = await import('../src/heuristic/bidding');
    if (!AUCTION_MODEL.source.startsWith('placeholder')) return;
    for (let i = 0; i < 40; i++) {
      const hand = createGame({ seed: `auction-model-${i}` }).hand;
      if (!hand) throw new Error('no hand');
      for (const partnerBid of [false, true]) {
        const h = hand.hands[(i % 4) as Seat];
        expect(fittedCeiling(AUCTION_MODEL, h, partnerBid, 5000)).toBe(
          ceilingForHand(h, partnerBid, 5000),
        );
      }
    }
    expect(fittedSigma(AUCTION_MODEL)).toBeCloseTo(20_000, 6);
  });

  it('decides from the observation alone', async () => {
    const { evaluateBid, CONTRACT_DEFAULTS } = await import('../src/contract/index');
    const { observe, Rng } = await import('@mam/engine');
    const opts = { ...CONTRACT_DEFAULTS, bidWorlds: 24, ceilingModel: 'fitted' as const };
    for (let i = 0; i < 6; i++) {
      const state = createGame({ seed: `auction-leak-${i}` });
      const hand = state.hand;
      if (!hand) throw new Error('no hand');
      const seat = hand.auction.turn;
      const others = ([0, 1, 2, 3] as Seat[]).filter((s) => s !== seat);
      const pool = [...others.flatMap((s) => hand.hands[s]), ...hand.widow].reverse();
      const moved = [...hand.hands] as number[][];
      others.forEach((s, k) => {
        moved[s] = pool.slice(13 * k, 13 * k + 13);
      });
      const swapped = {
        ...state,
        hand: { ...hand, hands: moved as unknown as typeof hand.hands, widow: pool.slice(39) },
      };
      const o1 = observe(state, seat);
      expect(observe(swapped, seat)).toEqual(o1);
      expect(evaluateBid(observe(swapped, seat), Rng.fromSeed('l'), opts)).toEqual(
        evaluateBid(o1, Rng.fromSeed('l'), opts),
      );
    }
  });
});
