import {
  type Action,
  type CardId,
  type Observation,
  type Rng,
  type Seat,
  SUITS,
  type Suit,
  type Team,
  teamOf,
} from '@mam/engine';
import {
  buildBelief,
  buildPlayState,
  captureUtility,
  DeadlineExceeded,
  ME_TABLE,
  SearchAborted,
  Solver,
  startEquity,
  type UtilityMode,
  type World,
} from '@mam/search';
import {
  auctionLikelihood,
  type Deal,
  discardCandidates,
  modelCeiling,
  playoutDeclare,
  playoutWith,
  utilityFor,
} from './simulate';

export interface ContractOptions {
  /** Deals sampled for bidding and misdeal decisions. */
  readonly bidWorlds: number;
  /** Deals sampled to screen discard/trump candidates by greedy playout. */
  readonly screenWorlds: number;
  /** Deals for the depth-limited search that re-checks the best candidates. */
  readonly refineWorlds: number;
  readonly refineTop: number;
  readonly refineDepth: number;
  /**
   * Total search nodes for the re-check; past it, the best fully re-checked candidate wins
   * (as past the deadline). Bounds the discard and trump decisions' time.
   */
  readonly refineNodes: number;
  readonly utility: UtilityMode;
  /** Bid only when declaring beats passing by more than this (utility units). */
  readonly bidMargin: number;
  /**
   * May raise over the partner's standing bid (false: pass and let the partner have it).
   * Off by default: auctions with a partner raise were made only 66% of the time, and
   * never raising won +5.7k points per hand on fresh boards (docs/bot-ladder.md).
   */
  readonly raisePartner: boolean;
  /** Scale ($) of the auction likelihood: larger trusts the bidding model less. */
  readonly auctionSigma: number;
  /**
   * The other players' bidding ceilings, as shift ($) + scale × the heuristic's ceiling:
   * for predicting the rest of the auction and weighting deals by the bids so far.
   */
  readonly ceilingShift: number;
  readonly ceilingScale: number;
  /** Whether a pass while partner holds the high bid counts as showing a weak hand. */
  readonly partnerPassInformative: boolean;
  /**
   * Calibration of the playout estimate in bidding and misdeal calls ($1000s): the
   * declaring team's capture is taken as Normal(calibA + calibB × estimate, calibSd²) and
   * the utility averaged over it; (0, 1, 0) uses the estimate as it is. Fit with
   * scripts/calibrate.ts (actual capture regressed on the estimate). The raw estimate badly
   * understates weak hands; calibrating won +5.7% equity per board on fresh boards
   * (docs/bot-ladder.md).
   */
  readonly calibA: number;
  readonly calibB: number;
  readonly calibSd: number;
}

export const CONTRACT_DEFAULTS: ContractOptions = {
  bidWorlds: 160,
  screenWorlds: 40,
  refineWorlds: 12,
  refineTop: 4,
  refineDepth: 1,
  refineNodes: Number.POSITIVE_INFINITY,
  utility: 'equity',
  bidMargin: 0,
  raisePartner: false,
  auctionSigma: 20_000,
  ceilingShift: 0,
  ceilingScale: 1,
  partnerPassInformative: true,
  calibA: 130,
  calibB: 0.5,
  calibSd: 58,
};

/**
 * Twelve equally likely points of Normal(0, 1): the medians of twelve equal-probability
 * bins, scaled to unit variance. Unlike Gauss–Hermite nodes they treat a step in the
 * utility (made or set) fairly: P(Z ≥ 0) is exactly one half.
 */
const NORMAL_POINTS: readonly number[] = [
  0.110344, 0.33603, 0.57846, 0.856548, 1.213134, 1.826177,
].flatMap((z) => [z, -z]);

/**
 * The utility of a playout estimate after calibration (see ContractOptions.calibA): money
 * the calibration moves to or from the declaring team `team` comes from or goes to the other.
 */
export function calibrated(
  u: (capK: readonly [number, number]) => number,
  team: Team,
  opts: Pick<ContractOptions, 'calibA' | 'calibB' | 'calibSd'>,
): (capK: readonly [number, number]) => number {
  const { calibA: a, calibB: b, calibSd: sd } = opts;
  if (a === 0 && b === 1 && sd === 0) return u;
  return (capK) => {
    const x = capK[team];
    const other = capK[team === 0 ? 1 : 0];
    const mean = a + b * x;
    let total = 0;
    for (const z of NORMAL_POINTS) {
      const y = Math.max(0, mean + sd * z);
      const o = Math.max(0, other - (y - x));
      total += u(team === 0 ? [y, o] : [o, y]);
    }
    return total / NORMAL_POINTS.length;
  };
}

function toDeal(obs: Observation, world: World): Deal {
  return {
    hands: [0, 1, 2, 3].map((s) => (s === obs.seat ? obs.hand : (world.hands[s] ?? []))),
    widow: world.pile,
  };
}

/** Predicted winner and price of an auction among `seats`, given the model's ceilings. */
function predictAuction(
  ceilings: ReadonlyMap<Seat, number>,
  high: { seat: Seat; amount: number } | null,
  minBid: number,
  raise: number,
  step: number,
): { seat: Seat; price: number } | null {
  const ranked = [...ceilings.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top || top[1] < minBid) return high ? { seat: high.seat, price: high.amount } : null;
  const second = ranked[1]?.[1] ?? (high ? high.amount - raise : minBid - raise);
  const price = Math.max(minBid, Math.min(top[1], Math.floor((second + raise) / step) * step));
  return { seat: top[0], price };
}

/** Fewest sampled deals a contract decision uses, even past its deadline. */
const MIN_WORLDS = 16;

/** Bid the minimum now, or pass, whichever has the higher expected value. */
export function decideBid(
  obs: Observation,
  rng: Rng,
  opts: ContractOptions,
  deadline = Number.POSITIVE_INFINITY,
): Action {
  const legal = obs.legal;
  if (legal.kind !== 'bid') throw new Error('decideBid outside bidding');
  if (!legal.canPass) return { type: 'bid', amount: legal.minBid };
  const { raiseIncrement: raise } = obs.ruleset.bidding;
  const step = legal.step;
  const passed = new Set(obs.auction.filter((e) => e.kind === 'pass').map((e) => e.seat));
  const lastBid = [...obs.auction].reverse().find((e) => e.kind === 'bid');
  const high =
    lastBid && lastBid.kind === 'bid' ? { seat: lastBid.seat, amount: lastBid.amount } : null;
  if (!opts.raisePartner && high && teamOf(high.seat) === teamOf(obs.seat)) return { type: 'pass' };
  const belief = buildBelief(obs);
  let wSum = 0;
  let declare = 0;
  let pass = 0;
  for (let i = 0; i < opts.bidWorlds; i++) {
    if (i >= MIN_WORLDS && Date.now() > deadline) break;
    const deal = toDeal(obs, belief.sample(rng));
    const w = auctionLikelihood(deal, obs, step, opts.auctionSigma, opts);
    if (w < 1e-9) continue;
    const mine = calibrated(
      utilityFor(obs, obs.seat, legal.minBid, opts.utility),
      teamOf(obs.seat),
      opts,
    )(playoutDeclare(deal, obs.seat));
    // If we pass: the others (still in) finish the auction by the model.
    const ceilings = new Map<Seat, number>();
    for (const s of [0, 1, 2, 3] as Seat[]) {
      if (s === obs.seat || passed.has(s)) continue;
      ceilings.set(
        s,
        s === high?.seat
          ? Math.max(high.amount, modelCeiling(deal, s, obs, step, opts))
          : modelCeiling(deal, s, obs, step, opts),
      );
    }
    const outcome = predictAuction(ceilings, high, legal.minBid, raise, step) ?? {
      seat: obs.seat,
      price: legal.minBid,
    };
    const theirs = calibrated(
      utilityFor(obs, outcome.seat, outcome.price, opts.utility),
      teamOf(outcome.seat),
      opts,
    )(playoutDeclare(deal, outcome.seat));
    wSum += w;
    declare += w * mine;
    pass += w * theirs;
  }
  if (wSum === 0) return { type: 'pass' };
  return declare - pass >= opts.bidMargin * wSum
    ? { type: 'bid', amount: legal.minBid }
    : { type: 'pass' };
}

/** Call a misdeal when this hand is worth less than an average fresh deal. */
export function decideMisdeal(
  obs: Observation,
  rng: Rng,
  opts: ContractOptions,
  deadline = Number.POSITIVE_INFINITY,
): Action {
  const legal = obs.legal;
  if (legal.kind !== 'misdeal' || !legal.canCall) return { type: 'declineMisdeal' };
  const { minOpeningBid, raiseIncrement, bidStep } = obs.ruleset.bidding;
  const opener = ((obs.dealer + 1) % 4) as Seat;
  const belief = buildBelief(obs);
  let keep = 0;
  let n = 0;
  for (let i = 0; i < opts.bidWorlds; i++) {
    if (i >= MIN_WORLDS && Date.now() > deadline) break;
    n += 1;
    const deal = toDeal(obs, belief.sample(rng));
    const ceilings = new Map<Seat, number>();
    for (const s of [0, 1, 2, 3] as Seat[])
      ceilings.set(s, modelCeiling(deal, s, obs, bidStep, opts));
    const outcome = predictAuction(ceilings, null, minOpeningBid, raiseIncrement, bidStep) ?? {
      seat: opener,
      price: minOpeningBid,
    };
    keep += calibrated(
      utilityFor(obs, outcome.seat, outcome.price, opts.utility),
      teamOf(outcome.seat),
      opts,
    )(playoutDeclare(deal, outcome.seat));
  }
  keep /= n;
  const redeal =
    opts.utility === 'equity' ? startEquity(ME_TABLE, obs.scores, teamOf(obs.seat), obs.dealer) : 0;
  return keep < redeal ? { type: 'callMisdeal' } : { type: 'declineMisdeal' };
}

interface Candidate {
  readonly keep: readonly CardId[];
  readonly trump: Suit;
  readonly discard: readonly CardId[];
}

/**
 * Picks the best (discard, trump) among candidates: screen all by greedy playouts over
 * shared sampled deals, then re-check the best few with depth-limited open-hand search.
 */
function bestCandidate(
  obs: Observation,
  rng: Rng,
  candidates: readonly Candidate[],
  opts: ContractOptions,
  deadline: number,
): Candidate {
  const contract = obs.contract;
  if (!contract) throw new Error('no contract');
  const belief = buildBelief(obs);
  const u = utilityFor(obs, contract.bidder, contract.amount, opts.utility);
  const screenDeals = Array.from({ length: opts.screenWorlds }, () => belief.sample(rng));
  const screened = candidates.map((c) => {
    let total = 0;
    for (const world of screenDeals) {
      const hands = [0, 1, 2, 3].map((s) => (s === obs.seat ? c.keep : (world.hands[s] ?? [])));
      total += u(playoutWith(hands, obs.seat, c.keep, c.trump));
    }
    return { c, value: total / screenDeals.length };
  });
  screened.sort((a, b) => b.value - a.value);
  const top = screened.slice(0, opts.refineTop);
  if (opts.refineWorlds <= 0 || top.length <= 1) return (top[0] as (typeof top)[0]).c;

  const team = teamOf(obs.seat);
  const u0 = captureUtility(
    {
      ruleset: obs.ruleset,
      scores: obs.scores,
      dealer: obs.dealer,
      bidder: contract.bidder,
      bid: contract.amount,
    },
    0,
    opts.utility,
    ME_TABLE,
  );
  const solver = new Solver({
    mode: 'utility',
    utility: (c0, c1) => u0([c0 * 1000, c1 * 1000]),
    maxEntries: 200_000,
  });
  const refineDeals = Array.from({ length: opts.refineWorlds }, () => belief.sample(rng));
  solver.deadline = deadline;
  // Past the deadline or node budget, the best candidate among those fully re-checked wins
  // (the screen's best is re-checked first).
  let best = top[0] as (typeof top)[0];
  let bestValue = Number.NEGATIVE_INFINITY;
  refine: for (const t of top) {
    let total = 0;
    for (const world of refineDeals) {
      const hands = [0, 1, 2, 3].map((s) => (s === obs.seat ? t.c.keep : (world.hands[s] ?? [])));
      const state = buildPlayState({
        hands,
        trump: t.c.trump,
        tricks: [],
        currentTrick: null,
        turn: obs.seat,
      });
      if (solver.nodes >= opts.refineNodes) break refine;
      solver.depthTricks = opts.refineDepth;
      solver.nodeLimit = Math.min(solver.nodes + 2_000_000, opts.refineNodes);
      let v0: number;
      try {
        v0 = solver.solve(state);
      } catch (e) {
        if (e instanceof DeadlineExceeded) break refine;
        if (!(e instanceof SearchAborted)) throw e;
        if (solver.nodes >= opts.refineNodes) break refine;
        v0 = u0([0, 0]);
      }
      total += team === 0 ? v0 : opts.utility === 'equity' ? 1 - v0 : -v0;
    }
    const value = total / refineDeals.length;
    if (value > bestValue) {
      bestValue = value;
      best = t;
    }
  }
  return best.c;
}

export function decideDiscard(
  obs: Observation,
  rng: Rng,
  opts: ContractOptions,
  deadline = Number.POSITIVE_INFINITY,
): Action {
  const legal = obs.legal;
  if (legal.kind !== 'discard') throw new Error('decideDiscard outside discarding');
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const trump of SUITS) {
    for (const discard of discardCandidates(obs.hand, trump)) {
      const key = `${[...discard].sort((a, b) => a - b).join(',')}|${trump}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ discard, trump, keep: obs.hand.filter((c) => !discard.includes(c)) });
    }
  }
  const best = bestCandidate(obs, rng, candidates, opts, deadline);
  return { type: 'discard', cardIds: [...best.discard] };
}

export function decideTrump(
  obs: Observation,
  rng: Rng,
  opts: ContractOptions,
  deadline = Number.POSITIVE_INFINITY,
): Action {
  const legal = obs.legal;
  if (legal.kind !== 'trump') throw new Error('decideTrump outside naming trump');
  const candidates = legal.suits.map((trump) => ({ trump, keep: obs.hand, discard: [] }));
  return {
    type: 'nameTrump',
    suit: bestCandidate(obs, rng, candidates, opts, deadline).trump,
  };
}
