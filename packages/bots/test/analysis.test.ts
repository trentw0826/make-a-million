import {
  type Action,
  applyActionOrThrow,
  createGame,
  type GameState,
  legalMoves,
  type Observation,
  observe,
  Rng,
  SEATS,
  type Seat,
  validate,
} from '@mam/engine';
import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_DEFAULTS,
  type AnalysisOptions,
  analyze,
  analyzeDecision,
  type Decision,
  labelFor,
  reviewMove,
} from '../src/analysis/index';
import { decideDiscard, decideTrump } from '../src/contract/index';
import { HeuristicBot } from '../src/heuristic/index';

/** Small budgets: the tests check shape and consistency, not strength. */
const FAST: AnalysisOptions = {
  ...ANALYSIS_DEFAULTS,
  search: {
    ...ANALYSIS_DEFAULTS.search,
    worlds: 6,
    exactWorlds: 6,
    nodes: 150_000,
    worldNodes: 30_000,
    bidWorlds: 24,
    screenWorlds: 8,
    refineWorlds: 3,
    refineTop: 3,
  },
  positionWorlds: 4,
  positionNodes: 120_000,
  positionWorldNodes: 30_000,
};

/** Every state of one game played by the heuristic bot, the first `hands` hands of it. */
function heuristicGame(seed: string, hands = 2): GameState[] {
  const bot = new HeuristicBot();
  const rng = Rng.fromSeed(`policy:${seed}`);
  let state = createGame({ seed });
  const states = [state];
  while (state.phase !== 'game-over' && (state.hand?.handNumber ?? 0) <= hands) {
    const seat = SEATS.find((s) => legalMoves(state, s).kind !== 'none');
    if (seat === undefined) break;
    const action = bot.decide(observe(state, seat), rng) as Action;
    state = applyActionOrThrow(state, seat, action).state;
    states.push(state);
  }
  return states;
}

/** States where `seat` has a decision of the given kind. */
function decisions(kind: string, seat: Seat = 0, max = 3): GameState[] {
  const found: GameState[] = [];
  for (let g = 0; g < 40 && found.length < max; g++) {
    for (const s of heuristicGame(`analysis-${g}`, 1)) {
      if (legalMoves(s, seat).kind === kind) found.push(s);
      if (found.length >= max) break;
    }
  }
  return found;
}

function expectSane(state: GameState, seat: Seat, decision: Decision | null): void {
  if (!decision) return;
  expect(decision.options.length).toBeGreaterThan(0);
  for (const o of decision.options) {
    expect(validate(state, seat, o.action)).toBeNull();
    expect(Number.isFinite(o.points)).toBe(true);
    expect(o.winChance).toBeGreaterThanOrEqual(0);
    expect(o.winChance).toBeLessThanOrEqual(1);
  }
  const best = decision.options[decision.best];
  for (const o of decision.options) expect(o.points).toBeLessThanOrEqual(best?.points ?? 0);
}

describe('solo analysis', () => {
  it('values every phase of a hand, whoever is to act, within [0, 1]', () => {
    const states = heuristicGame('analysis-phases', 1);
    const seen = new Set<string>();
    states.forEach((state, i) => {
      // Every position at the start and end of the hand, and a sample of the play between.
      const phase = observe(state, 0).phase;
      if (phase === 'playing' && i % 5 !== 0) return;
      seen.add(phase);
      const a = analyze(observe(state, 0), Rng.fromSeed(i), FAST);
      expect(a.winChance).toBeGreaterThanOrEqual(0);
      expect(a.winChance).toBeLessThanOrEqual(1);
      expectSane(state, 0, a.decision);
    });
    expect(seen).toContain('bidding');
    expect(seen).toContain('playing');
    expect(seen).toContain('hand-complete');
  });

  for (const kind of ['bid', 'play', 'discard', 'trump'] as const) {
    it(`lists legal ${kind} options with the best one first in points`, () => {
      const states = decisions(kind);
      expect(states.length).toBeGreaterThan(0);
      for (const state of states) {
        const decision = analyzeDecision(observe(state, 0), Rng.fromSeed('d'), FAST);
        expect(decision?.kind).toBe(kind === 'bid' ? 'bid' : kind);
        expectSane(state, 0, decision);
      }
    });
  }

  it('values every legal card, and every trump', () => {
    const [play] = decisions('play', 0, 1);
    const [trump] = decisions('trump', 0, 1);
    if (!play || !trump) throw new Error('no fixtures');
    const legal = legalMoves(play, 0);
    const cards = analyzeDecision(observe(play, 0), Rng.fromSeed(1), FAST)?.options.map((o) =>
      o.action.type === 'playCard' ? o.action.cardId : -1,
    );
    expect(new Set(cards)).toEqual(new Set(legal.kind === 'play' ? legal.cardIds : []));
    expect(analyzeDecision(observe(trump, 0), Rng.fromSeed(1), FAST)?.options).toHaveLength(4);
  });

  it('is deterministic for the same observation and seed', () => {
    for (const kind of ['bid', 'play', 'discard'] as const) {
      const [state] = decisions(kind, 0, 1);
      if (!state) throw new Error('no fixture');
      const a = analyze(observe(state, 0), Rng.fromSeed('same'), FAST);
      const b = analyze(observe(state, 0), Rng.fromSeed('same'), FAST);
      expect(b).toEqual(a);
    }
  });

  it('cannot see the other hands: swapping hidden cards changes nothing', () => {
    const [state] = decisions('play', 0, 1);
    const hand = state?.hand;
    if (!state || !hand) throw new Error('no fixture');
    // Swap one card between two other seats that hold the same number of cards.
    const [a, b] = [hand.hands[1], hand.hands[3]];
    if (a.length !== b.length || a.length === 0) throw new Error('uneven fixture');
    const swapped: GameState = {
      ...state,
      hand: {
        ...hand,
        hands: [
          hand.hands[0],
          [b[0] as number, ...a.slice(1)],
          hand.hands[2],
          [a[0] as number, ...b.slice(1)],
        ],
      },
    } as GameState;
    const obs: Observation = observe(state, 0);
    expect(observe(swapped, 0)).toEqual(obs);
    expect(analyze(observe(swapped, 0), Rng.fromSeed('leak'), FAST)).toEqual(
      analyze(obs, Rng.fromSeed('leak'), FAST),
    );
  });

  it("leaves the bot's discard and trump legal and repeatable", () => {
    for (const kind of ['discard', 'trump'] as const) {
      for (const state of decisions(kind, 0, 2)) {
        const obs = observe(state, 0);
        const opts = FAST.search;
        const a =
          kind === 'discard'
            ? decideDiscard(obs, Rng.fromSeed('k'), opts)
            : decideTrump(obs, Rng.fromSeed('k'), opts);
        const b =
          kind === 'discard'
            ? decideDiscard(obs, Rng.fromSeed('k'), opts)
            : decideTrump(obs, Rng.fromSeed('k'), opts);
        expect(validate(state, 0, a)).toBeNull();
        expect(b).toEqual(a);
      }
    }
  });

  it("lists a discard of the player's own when asked to", () => {
    const [state] = decisions('discard', 0, 1);
    if (!state) throw new Error('no fixture');
    const obs = observe(state, 0);
    const listed = analyzeDecision(obs, Rng.fromSeed(2), FAST);
    const own = listed?.options.at(-1)?.action;
    if (own?.type !== 'discard') throw new Error('no discard listed');
    const withOwn = analyzeDecision(obs, Rng.fromSeed(2), FAST, undefined, own.cardIds);
    const review = withOwn && reviewMove(withOwn, own);
    expect(review).not.toBeNull();
  });
});

describe('move labels', () => {
  const decision: Decision = {
    kind: 'play',
    best: 0,
    options: [
      { action: { type: 'playCard', cardId: 1 }, points: 50, winChance: 0.6 },
      { action: { type: 'playCard', cardId: 2 }, points: 49.5, winChance: 0.6 },
      { action: { type: 'playCard', cardId: 3 }, points: 40, winChance: 0.55 },
      { action: { type: 'playCard', cardId: 4 }, points: 0, winChance: 0.4 },
    ],
  };

  it('grades a move by the money it gave up', () => {
    expect(reviewMove(decision, { type: 'playCard', cardId: 1 })).toEqual({
      label: 'best',
      lossK: 0,
      best: { type: 'playCard', cardId: 1 },
    });
    expect(reviewMove(decision, { type: 'playCard', cardId: 2 })?.label).toBe('best');
    expect(reviewMove(decision, { type: 'playCard', cardId: 3 })?.label).toBe('inaccuracy');
    expect(reviewMove(decision, { type: 'playCard', cardId: 4 })?.label).toBe('blunder');
    expect(reviewMove(decision, { type: 'playCard', cardId: 9 })).toBeNull();
  });

  it('calls a lone legal move forced, and any bid a bid', () => {
    const only: Decision = { kind: 'play', best: 0, options: [decision.options[0] as never] };
    expect(reviewMove(only, { type: 'playCard', cardId: 1 })?.label).toBe('forced');
    const bid: Decision = {
      kind: 'bid',
      best: 1,
      options: [
        { action: { type: 'bid', amount: 120_000 }, points: -10, winChance: 0.4 },
        { action: { type: 'pass' }, points: 2, winChance: 0.5 },
      ],
    };
    expect(reviewMove(bid, { type: 'bid', amount: 140_000 })).toMatchObject({
      label: 'inaccuracy',
      lossK: 12,
    });
  });

  it('has thresholds in order', () => {
    expect([0, 3, 10, 30, 80].map((k) => labelFor(k))).toEqual([
      'best',
      'good',
      'inaccuracy',
      'mistake',
      'blunder',
    ]);
  });
});
