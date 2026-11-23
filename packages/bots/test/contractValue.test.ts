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

describe('discard and trump screened by the contract-value model', () => {
  it('uses the same features as bidding when given the heuristic keep and trump', async () => {
    const { contractFeaturesWith } = await import('../src/contract/value');
    for (let i = 0; i < 10; i++) {
      const hand = createGame({ seed: `with-${i}` }).hand;
      if (!hand) throw new Error('no hand');
      const declarer = (i % 4) as Seat;
      const { keep, trump } = heuristicContract([...hand.hands[declarer], ...hand.widow]);
      const a = contractFeatures({ hands: hand.hands, widow: hand.widow }, declarer);
      expect(contractFeaturesWith(hand.hands, declarer, keep, trump)).toEqual(a);
    }
  });

  it('discards and names trump legally, from the observation alone', async () => {
    const { applyActionOrThrow, legalMoves, observe, Rng, SEATS } = await import('@mam/engine');
    const { HardBot, HARD_DEFAULTS } = await import('../src/hard/index');
    const { HeuristicBot } = await import('../src/heuristic/index');
    const bot = new HardBot({
      ...HARD_DEFAULTS,
      screenValue: 'model',
      screenWorlds: 8,
      refineWorlds: 2,
    });
    const normal = new HeuristicBot();
    let checked = 0;
    for (let i = 0; i < 6; i++) {
      let state = createGame({ seed: `screen-model-${i}` });
      const rng = Rng.fromSeed(`screen-model-${i}`);
      while (
        state.hand?.phase === 'bidding' ||
        state.hand?.phase === 'discarding' ||
        state.hand?.phase === 'naming-trump'
      ) {
        const seat = SEATS.find((s) => legalMoves(state, s).kind !== 'none') as Seat;
        const obs = observe(state, seat);
        const kind = obs.legal.kind;
        const action =
          kind === 'discard' || kind === 'trump'
            ? bot.decide(obs, Rng.fromSeed('m'))
            : normal.decide(obs, rng);
        if (kind === 'discard' || kind === 'trump') {
          // Another arrangement of the other hands: the bidder sees exactly the same.
          const hand = state.hand;
          const others = ([0, 1, 2, 3] as Seat[]).filter((s) => s !== seat);
          const pool = others.flatMap((s) => hand.hands[s]).reverse();
          const moved = [...hand.hands] as number[][];
          others.forEach((s, k) => {
            moved[s] = pool.slice(13 * k, 13 * k + 13);
          });
          const other = {
            ...state,
            hand: { ...hand, hands: moved as unknown as typeof hand.hands },
          };
          expect(observe(other, seat)).toEqual(obs);
          expect(bot.decide(observe(other, seat), Rng.fromSeed('m'))).toEqual(action);
          checked += 1;
        }
        state = applyActionOrThrow(state, seat, action).state;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(10);
  });
});

describe('bidding valued by the rest of the auction (bidOutcome: auction)', () => {
  it('predicts an overcall only from an opponent who would pay the next price', async () => {
    const { afterOurBid } = await import('../src/contract/index');
    // Seat 0 bids 150k; raises are 10k. Seat 2 is the partner.
    const c = (entries: [Seat, number][]) => new Map<Seat, number>(entries);
    expect(
      afterOurBid(
        c([
          [1, 150_000],
          [2, 400_000],
          [3, 100_000],
        ]),
        0,
        150_000,
        10_000,
        5_000,
      ),
    ).toBeNull();
    expect(
      afterOurBid(
        c([
          [1, 200_000],
          [3, 100_000],
        ]),
        0,
        150_000,
        10_000,
        5_000,
      ),
    ).toEqual({
      seat: 1,
      price: 160_000,
    });
    // The partner outbids the overcalling opponent.
    expect(
      afterOurBid(
        c([
          [1, 200_000],
          [2, 300_000],
        ]),
        0,
        150_000,
        10_000,
        5_000,
      ),
    ).toEqual({
      seat: 2,
      price: 210_000,
    });
  });

  it('changes only the value of bidding, and decides from the observation alone', async () => {
    const { evaluateBid, CONTRACT_DEFAULTS } = await import('../src/contract/index');
    const { observe, Rng } = await import('@mam/engine');
    const win = { ...CONTRACT_DEFAULTS, bidWorlds: 24, contractValue: 'model' as const };
    const auction = { ...win, bidOutcome: 'auction' as const };
    let changed = 0;
    for (let i = 0; i < 6; i++) {
      const state = createGame({ seed: `outcome-leak-${i}` });
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
      const a = evaluateBid(o1, Rng.fromSeed('o'), auction);
      expect(evaluateBid(observe(swapped, seat), Rng.fromSeed('o'), auction)).toEqual(a);
      const w = evaluateBid(o1, Rng.fromSeed('o'), win);
      expect(a?.pass).toBe(w?.pass);
      if (a?.declare !== w?.declare) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });
});
