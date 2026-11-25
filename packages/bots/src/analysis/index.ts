import {
  type Action,
  type CardId,
  cardById,
  nextSeat,
  type Observation,
  type Rng,
  type Seat,
  type Suit,
  teamOf,
} from '@mam/engine';
import {
  buildBelief,
  captureUtility,
  DeadlineExceeded,
  type HandContext,
  ME_TABLE,
  playStateFromWorld,
  SearchAborted,
  Solver,
  splitRest,
  startEquity,
  type World,
} from '@mam/search';
import {
  type Candidate,
  declareValue,
  discardPlans,
  evaluateBid,
  predictAuction,
  rankCandidates,
  toDeal,
} from '../contract/index';
import {
  auctionLikelihood,
  heuristicContract,
  modelCeiling,
  playoutWith,
  utilityFor,
} from '../contract/simulate';
import { EXPERT_DEFAULTS, type HardOptions, pimcValues, worldWeight } from '../hard/index';
import { bestTrump } from '../heuristic/evaluate';
import { labelFor, type MoveLabel } from './labels';

export { LABEL_LIMITS_K, labelFor, type MoveLabel } from './labels';

/**
 * Solo analysis: what a decision and a position are worth to one seat, from that seat's
 * Observation alone (docs/bot-standards.md, Analysis). It reuses Expert's search and
 * inference, so it knows exactly what an Expert bot in the seat would know, and it never
 * plays: nothing here changes what any bot does.
 *
 * Two units: `points` is the hand's expected score change for the seat's side minus the
 * opponents' ($1000s), which is what a move is graded by; `winChance` is the side's chance of
 * winning the game (match equity), which the position bar shows.
 */

export interface AnalysisOptions {
  /** The search settings (budgets, inference, contract values) the analysis borrows. */
  readonly search: HardOptions;
  /** Sampled deals for valuing a position when the seat has no decision to make. */
  readonly positionWorlds: number;
  /** Node budget of that position search, in total and per deal. */
  readonly positionNodes: number;
  readonly positionWorldNodes: number;
  /** How many discard plans a discard decision lists. */
  readonly listDiscards: number;
}

/**
 * Expert's settings: its decisions measure +3.9% equity per board over Hard's. A decision
 * costs the analysis what it costs an Expert bot, so the server gives it Expert's deadline
 * (docs/bot-ladder.md, Timing).
 */
export const ANALYSIS_DEFAULTS: AnalysisOptions = {
  search: EXPERT_DEFAULTS,
  positionWorlds: 24,
  positionNodes: 1_500_000,
  positionWorldNodes: 150_000,
  listDiscards: 3,
};

export type DecisionKind = 'play' | 'bid' | 'discard' | 'trump';

export interface DecisionOption {
  readonly action: Action;
  /** Expected score change for the seat's side minus the opponents' this hand ($1000s). */
  readonly points: number;
  /** The side's chance of winning the game after this choice (0–1). */
  readonly winChance: number;
}

export interface Decision {
  readonly kind: DecisionKind;
  readonly options: readonly DecisionOption[];
  /** Index of the option worth the most points. */
  readonly best: number;
}

export interface Analysis {
  /** The seat's side's chance of winning the game from here, with its best choice. */
  readonly winChance: number;
  /** The seat's own decision, when it has one (not for confirming a hand result). */
  readonly decision: Decision | null;
}

export interface MoveReview {
  readonly label: MoveLabel;
  /** Points given up against the best option ($1000s, never negative). */
  readonly lossK: number;
  readonly best: Action;
}

/** Everything a hand's outcome depends on, once it has a contract. */
function handContext(obs: Observation): HandContext | null {
  if (!obs.contract) return null;
  return {
    ruleset: obs.ruleset,
    scores: obs.scores,
    dealer: obs.dealer,
    bidder: obs.contract.bidder,
    bid: obs.contract.amount,
  };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * Analyses the seat's position, and its decision when it has one. `include` adds a discard
 * of the player's own to a discard decision's list (to review a plan the list left out).
 */
export function analyze(
  obs: Observation,
  rng: Rng,
  opts: AnalysisOptions = ANALYSIS_DEFAULTS,
  deadline = Number.POSITIVE_INFINITY,
  include: readonly CardId[] | null = null,
): Analysis {
  const decision = analyzeDecision(obs, rng, opts, deadline, include);
  if (decision) {
    const winChance = Math.max(...decision.options.map((o) => o.winChance));
    return { winChance: clamp01(winChance), decision };
  }
  return { winChance: clamp01(analyzePosition(obs, rng, opts, deadline)), decision: null };
}

/** The value of each option the seat has now (null: nothing to decide). */
export function analyzeDecision(
  obs: Observation,
  rng: Rng,
  opts: AnalysisOptions = ANALYSIS_DEFAULTS,
  deadline = Number.POSITIVE_INFINITY,
  include: readonly CardId[] | null = null,
): Decision | null {
  switch (obs.legal.kind) {
    case 'play':
      return analyzePlay(obs, rng, opts, deadline);
    case 'bid':
      return analyzeBid(obs, rng, opts, deadline);
    case 'discard':
      return analyzeContract(obs, rng, opts, deadline, 'discard', include);
    case 'trump':
      return analyzeContract(obs, rng, opts, deadline, 'trump', null);
    default:
      return null;
  }
}

function withBest(kind: DecisionKind, options: DecisionOption[]): Decision {
  let best = 0;
  for (let i = 1; i < options.length; i++) {
    if ((options[i] as DecisionOption).points > (options[best] as DecisionOption).points) best = i;
  }
  return { kind, options, best };
}

// ---------------------------------------------------------------------------
// Card play: the bot's PIMC search, valued at the root in money and in match equity.

function analyzePlay(
  obs: Observation,
  rng: Rng,
  opts: AnalysisOptions,
  deadline: number,
): Decision | null {
  const ctx = handContext(obs);
  if (!ctx) return null;
  const team = teamOf(obs.seat);
  const money = captureUtility(ctx, team, 'margin', null);
  const equity = captureUtility(ctx, team, 'equity', ME_TABLE);
  const weight = worldWeight(obs, opts.search);
  const result = pimcValues(obs, rng, opts.search, {
    ...(weight ? { weight } : {}),
    deadline,
    rootUtilities: [
      // 'margin' is in $100k; points are in $1000s.
      (c0, c1) => money([c0 * 1000, c1 * 1000]) * 100,
      (c0, c1) => equity([c0 * 1000, c1 * 1000]),
    ],
  });
  const [points, wins] = result.rootMeans as [readonly number[], readonly number[]];
  const options = result.moves.map(
    (cardId, i): DecisionOption => ({
      action: { type: 'playCard', cardId },
      points: points[i] as number,
      winChance: clamp01(wins[i] as number),
    }),
  );
  return withBest('play', options);
}

// ---------------------------------------------------------------------------
// Bidding: bid the minimum or pass (and call a misdeal, when allowed).

function analyzeBid(
  obs: Observation,
  rng: Rng,
  opts: AnalysisOptions,
  deadline: number,
): Decision | null {
  const legal = obs.legal;
  if (legal.kind !== 'bid') return null;
  const e = evaluateBid(obs, rng, opts.search, deadline, ['margin', 'equity']);
  if (!e) return null;
  const [money, equity] = e.byMode as [
    { declare: number; pass: number },
    { declare: number; pass: number },
  ];
  const options: DecisionOption[] = [
    {
      action: { type: 'bid', amount: legal.minBid },
      points: money.declare * 100,
      winChance: clamp01(equity.declare),
    },
  ];
  if (legal.canPass) {
    options.push({
      action: { type: 'pass' },
      points: money.pass * 100,
      winChance: clamp01(equity.pass),
    });
  }
  if (legal.canCallMisdeal) {
    // A fresh deal is taken as even in points, and worth the table's equity at the start
    // of a hand.
    options.push({
      action: { type: 'callMisdeal' },
      points: 0,
      winChance: startEquity(ME_TABLE, obs.scores, teamOf(obs.seat), obs.dealer),
    });
  }
  return withBest('bid', options);
}

// ---------------------------------------------------------------------------
// Discards and trump: the bot's own candidate ranking, in money; equity by playout.

function analyzeContract(
  obs: Observation,
  rng: Rng,
  opts: AnalysisOptions,
  deadline: number,
  kind: 'discard' | 'trump',
  include: readonly CardId[] | null,
): Decision | null {
  const contract = obs.contract;
  if (!contract) return null;
  const candidates: Candidate[] =
    kind === 'discard'
      ? discardPlans(obs.hand, include)
      : (obs.legal.kind === 'trump' ? obs.legal.suits : []).map((trump) => ({
          trump,
          keep: obs.hand,
          discard: [],
        }));
  const ranked = rankCandidates(
    obs,
    rng,
    candidates,
    { ...opts.search, utility: 'margin' },
    deadline,
  );

  // Each discard listed once, with the trump it is best with; every trump is listed.
  const listed: { candidate: Candidate; value: number }[] = [];
  const seen = new Set<string>();
  const key = (c: Candidate) =>
    kind === 'trump' ? c.trump : [...c.discard].sort((a, b) => a - b).join(',');
  const wanted = include ? [...include].sort((a, b) => a - b).join(',') : null;
  for (const r of ranked) {
    const k = key(r.candidate);
    if (seen.has(k)) continue;
    seen.add(k);
    const room = kind === 'trump' || listed.length < opts.listDiscards;
    if (room || k === wanted) listed.push({ candidate: r.candidate, value: r.value });
  }

  // Match equity by greedy playouts over shared sampled deals (cheap, and enough for a bar).
  const belief = buildBelief(obs);
  const deals = Array.from({ length: opts.search.screenWorlds }, () => belief.sample(rng));
  const u = utilityFor(obs, contract.bidder, contract.amount, 'equity');
  const equityOf = (c: Candidate) => {
    let total = 0;
    for (const world of deals) {
      const hands = [0, 1, 2, 3].map((s) => (s === obs.seat ? c.keep : (world.hands[s] ?? [])));
      total += u(playoutWith(hands, obs.seat, c.keep, c.trump));
    }
    return total / Math.max(1, deals.length);
  };

  const options = listed.map(
    ({ candidate, value }): DecisionOption => ({
      action:
        kind === 'trump'
          ? { type: 'nameTrump', suit: candidate.trump }
          : { type: 'discard', cardIds: [...candidate.discard].sort((a, b) => a - b) },
      points: value * 100,
      winChance: clamp01(equityOf(candidate)),
    }),
  );
  return withBest(kind, options);
}

// ---------------------------------------------------------------------------
// Positions where the seat has nothing to decide.

/** The seat's side's chance of winning the game from here (0–1). */
export function analyzePosition(
  obs: Observation,
  rng: Rng,
  opts: AnalysisOptions = ANALYSIS_DEFAULTS,
  deadline = Number.POSITIVE_INFINITY,
): number {
  const team = teamOf(obs.seat);
  switch (obs.phase) {
    case 'game-over':
      return obs.winner === team ? 1 : 0;
    case 'hand-complete':
      // The scores already include the hand; the next is dealt by the next seat.
      return startEquity(ME_TABLE, obs.scores, team, nextSeat(obs.dealer));
    case 'bidding':
      return auctionOutlook(obs, rng, opts, deadline);
    case 'discarding':
    case 'naming-trump':
      return contractOutlook(obs, rng, opts);
    case 'playing':
      return playOutlook(obs, rng, opts, deadline);
  }
}

/** Fewest sampled deals used, even past the deadline. */
const MIN_WORLDS = 16;

/**
 * During someone else's turn to bid: the auction finished by the bidding model, every seat
 * still in it (this one included) bidding to its modelled ceiling, then played out.
 */
function auctionOutlook(
  obs: Observation,
  rng: Rng,
  opts: AnalysisOptions,
  deadline: number,
): number {
  const team = teamOf(obs.seat);
  const { raiseIncrement: raise, minOpeningBid, bidStep: step } = obs.ruleset.bidding;
  const passed = new Set(obs.auction.filter((e) => e.kind === 'pass').map((e) => e.seat));
  const lastBid = [...obs.auction].reverse().find((e) => e.kind === 'bid');
  const high =
    lastBid && lastBid.kind === 'bid' ? { seat: lastBid.seat, amount: lastBid.amount } : null;
  const minBid = high ? high.amount + raise : minOpeningBid;
  // A hand thrown in is dealt again by the next seat.
  const redeal = startEquity(ME_TABLE, obs.scores, team, nextSeat(obs.dealer));
  const belief = buildBelief(obs);
  const h = opts.search;
  let wSum = 0;
  let total = 0;
  for (let i = 0; i < h.bidWorlds; i++) {
    if (i >= MIN_WORLDS && Date.now() > deadline) break;
    const deal = toDeal(obs, belief.sample(rng));
    const w = auctionLikelihood(deal, obs, step, h.auctionSigma, h);
    if (w < 1e-9) continue;
    const ceilings = new Map<Seat, number>();
    for (const s of [0, 1, 2, 3] as Seat[]) {
      if (passed.has(s)) continue;
      const c = modelCeiling(deal, s, obs, step, h);
      ceilings.set(s, s === high?.seat ? Math.max(high.amount, c) : c);
    }
    const outcome = predictAuction(ceilings, high, minBid, raise, step);
    const value = outcome
      ? declareValue(deal, outcome.seat, h)(utilityFor(obs, outcome.seat, outcome.price, 'equity'))
      : redeal;
    wSum += w;
    total += w * value;
  }
  return wSum > 0 ? total / wSum : redeal;
}

/**
 * While the other side's or the partner's contract is being set up: the bidder's discards
 * and trump as the heuristic would choose them, played out over sampled deals.
 */
function contractOutlook(obs: Observation, rng: Rng, opts: AnalysisOptions): number {
  const contract = obs.contract;
  if (!contract) return 0.5;
  const bidder = contract.bidder;
  const belief = buildBelief(obs);
  const u = utilityFor(obs, bidder, contract.amount, 'equity');
  const n = opts.search.screenWorlds;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const world = belief.sample(rng);
    const hands = [0, 1, 2, 3].map((s) => (s === obs.seat ? obs.hand : (world.hands[s] ?? [])));
    const held = hands[bidder] ?? [];
    let keep: readonly CardId[];
    let trump: Suit;
    if (held.length > 13) {
      ({ keep, trump } = heuristicContract(held));
    } else {
      keep = held;
      trump = bestTrump(held.map(cardById)).suit;
    }
    total += u(playoutWith(hands, bidder, keep, trump));
  }
  return total / Math.max(1, n);
}

/**
 * During play, whoever is to move: each sampled deal searched from the current position as
 * the bot would search it (two tricks deep, exact near the end), then valued in match equity.
 */
function playOutlook(obs: Observation, rng: Rng, opts: AnalysisOptions, deadline: number): number {
  const ctx = handContext(obs);
  if (!ctx || obs.trump === null || obs.turn === null) return 0.5;
  const team = teamOf(obs.seat);
  const equity = captureUtility(ctx, team, 'equity', ME_TABLE);
  const weight = worldWeight(obs, opts.search);
  const belief = buildBelief(obs);
  const live = obs.handSizes.reduce((a, b) => a + b, 0) + (obs.currentTrick?.plays.length ?? 0);
  let depth = live <= opts.search.exactTricks * 4 ? Number.POSITIVE_INFINITY : opts.search.depth;
  const solver = new Solver({ mode: 'linear', maxEntries: 400_000 });
  solver.deadline = deadline;
  let wSum = 0;
  let total = 0;
  let done = 0;
  outer: while (done < opts.positionWorlds && solver.nodes < opts.positionNodes) {
    const world: World = belief.sample(rng);
    const w = weight ? weight(world) : 1;
    for (;;) {
      const state = playStateFromWorld(obs, world.hands);
      const root = { cap0: state.cap0, cap1: state.cap1, rest: state.moneyOutK() };
      solver.depthTricks = depth;
      solver.nodeLimit =
        depth <= 1 ? Number.POSITIVE_INFINITY : solver.nodes + opts.positionWorldNodes;
      try {
        const v = solver.solve(state);
        const [f0, f1] = splitRest(root.cap0, root.cap1, root.rest, v);
        total += w * equity([f0 * 1000, f1 * 1000]);
        wSum += w;
        done += 1;
        break;
      } catch (e) {
        if (e instanceof DeadlineExceeded) {
          if (done > 0) break outer;
          // Nothing valued yet: one trick deep is quick, so finish that off the clock.
          solver.deadline = Number.POSITIVE_INFINITY;
          depth = 1;
          continue;
        }
        if (!(e instanceof SearchAborted)) throw e;
        depth = depth === Number.POSITIVE_INFINITY ? opts.search.depth : Math.max(1, depth - 1);
      }
    }
  }
  return wSum > 0 ? total / wSum : startEquity(ME_TABLE, obs.scores, team, obs.dealer);
}

// ---------------------------------------------------------------------------
// Grading a choice.

function sameAction(a: Action, b: Action): boolean {
  switch (a.type) {
    case 'playCard':
      return b.type === 'playCard' && a.cardId === b.cardId;
    case 'bid':
      // Only the minimum is valued; any bid is taken as declaring.
      return b.type === 'bid';
    case 'nameTrump':
      return b.type === 'nameTrump' && a.suit === b.suit;
    case 'discard': {
      if (b.type !== 'discard') return false;
      const x = [...a.cardIds].sort((p, q) => p - q).join(',');
      const y = [...b.cardIds].sort((p, q) => p - q).join(',');
      return x === y;
    }
    default:
      return a.type === b.type;
  }
}

/**
 * Grades `action` against the decision's options. Null when the action is not among them
 * (a discard the list left out: analyse again with it included).
 */
export function reviewMove(decision: Decision, action: Action): MoveReview | null {
  const chosen = decision.options.find((o) => sameAction(o.action, action));
  if (!chosen) return null;
  const best = decision.options[decision.best] as DecisionOption;
  const lossK = Math.max(0, best.points - chosen.points);
  return {
    label: labelFor(lossK, decision.options.length === 1),
    lossK,
    best: best.action,
  };
}
