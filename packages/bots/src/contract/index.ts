import {
  type Action,
  type CardId,
  type Observation,
  openingLeader,
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
import { CONTRACT_MODEL } from './generated/contractModel';
import {
  auctionLikelihood,
  type Deal,
  discardCandidates,
  modelCeiling,
  playoutDeclare,
  playoutWith,
  utilityFor,
} from './simulate';
import {
  type ContractModel,
  contractFeatures,
  contractFeaturesWith,
  predictCapture,
} from './value';

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
   * The other players' bidding: 'heuristic' (the ceilings above) or 'fitted', the model of
   * how the bots really bid (contract/auction.ts), for both the rest of the auction and the
   * weighting of deals.
   */
  readonly ceilingModel: 'heuristic' | 'fitted';
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
  /**
   * How bidding and misdeal calls value a declarer's contract in a sampled deal: 'playout',
   * the calibrated greedy playout; 'model', the learned contract-value model
   * (contract/value.ts, generated/contractModel.ts), Normal(mean, sd²) around its prediction.
   */
  readonly contractValue: 'playout' | 'model';
  /** Also calibrate the playouts that screen discard and trump candidates. */
  readonly calibScreen: boolean;
  /**
   * How the screen values a discard-and-trump candidate in a sampled deal: 'playout', the
   * greedy playout; 'model', the contract-value model with that keep and trump.
   */
  readonly screenValue: 'playout' | 'model';
  /**
   * What bidding the minimum is worth in a sampled deal. 'win': declaring at that price.
   * 'auction': the rest of the auction by the bidding model. If an opponent's ceiling reaches
   * the next price they overcall, we drop out, and the players still in finish the auction
   * (partner may then outbid them); otherwise we declare at the minimum.
   */
  readonly bidOutcome: 'win' | 'auction';
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
  ceilingModel: 'heuristic',
  calibA: 130,
  calibB: 0.5,
  calibSd: 58,
  calibScreen: false,
  contractValue: 'playout',
  screenValue: 'playout',
  bidOutcome: 'win',
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

/**
 * The observer's utility of `declarer` declaring `deal` (a sampled world), as a function of
 * the utility `u` of the final captures: the calibrated greedy playout, or the contract-value
 * model's prediction (opts.contractValue). The playout runs once, whatever `u` is asked.
 */
export function declareValue(
  deal: Deal,
  declarer: Seat,
  opts: ContractOptions,
): (u: (capK: readonly [number, number]) => number) => number {
  if (opts.contractValue === 'model') return modelValuer(deal, declarer, CONTRACT_MODEL);
  const cap = playoutDeclare(deal, declarer);
  return (u) => calibrated(u, teamOf(declarer), opts)(cap);
}

/**
 * The utility `u` of `declarer` declaring `deal` under a contract-value model: the declaring
 * team's capture is Normal(model mean, model sd²), and the money it gains or loses against
 * the greedy playout comes from or goes to the other team (as in `calibrated`).
 */
export function modelValue(
  deal: Deal,
  declarer: Seat,
  u: (capK: readonly [number, number]) => number,
  model: ContractModel,
): number {
  return modelValuer(deal, declarer, model)(u);
}

function modelValuer(
  deal: Deal,
  declarer: Seat,
  model: ContractModel,
): (u: (capK: readonly [number, number]) => number) => number {
  const playout: [number, number] = [0, 0];
  const x = contractFeatures(deal, declarer, undefined, playout);
  const mean = predictCapture(model, x);
  const sd = model.sd;
  return (u) => calibrated(u, teamOf(declarer), { calibA: mean, calibB: 0, calibSd: sd })(playout);
}

/** A sampled world as a full deal, with the observer's own hand. */
export function toDeal(obs: Observation, world: World): Deal {
  return {
    hands: [0, 1, 2, 3].map((s) => (s === obs.seat ? obs.hand : (world.hands[s] ?? []))),
    widow: world.pile,
  };
}

/** Predicted winner and price of an auction among `seats`, given the model's ceilings. */
export function predictAuction(
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

/**
 * The model's auction after we bid `bid`: null if no opponent's ceiling reaches the next
 * price (we declare at `bid`), else the winner and price once we drop out and the others
 * finish it (the partner may outbid the opponents).
 */
export function afterOurBid(
  ceilings: ReadonlyMap<Seat, number>,
  seat: Seat,
  bid: number,
  raise: number,
  step: number,
): { seat: Seat; price: number } | null {
  const next = bid + raise;
  let overcall = false;
  for (const [s, c] of ceilings) if (teamOf(s) !== teamOf(seat) && c >= next) overcall = true;
  if (!overcall) return null;
  return predictAuction(ceilings, { seat, amount: bid }, next, raise, step);
}

/** Fewest sampled deals a contract decision uses, even past its deadline. */
const MIN_WORLDS = 16;

/** What bidding the minimum now and passing are each worth, averaged over sampled deals. */
export interface BidEvaluation {
  /** Mean utility of declaring at the minimum bid, and of passing (weighted by deal). */
  readonly declare: number;
  readonly pass: number;
  readonly worlds: number;
  /** Who the model expects to win the auction if we pass (shares of the weight). */
  readonly ifPass: { readonly self: number; readonly partner: number; readonly opponent: number };
  /** Mean predicted price if we pass. */
  readonly passPrice: number;
  /** The same two values under each of the extra `modes` asked for (same order). */
  readonly byMode: readonly { readonly declare: number; readonly pass: number }[];
}

/** Evaluates bidding the minimum against passing (null: deals all inconsistent). */
export function evaluateBid(
  obs: Observation,
  rng: Rng,
  opts: ContractOptions,
  deadline = Number.POSITIVE_INFINITY,
  modes: readonly UtilityMode[] = [],
): BidEvaluation | null {
  const legal = obs.legal;
  if (legal.kind !== 'bid') throw new Error('evaluateBid outside bidding');
  const { raiseIncrement: raise } = obs.ruleset.bidding;
  const step = legal.step;
  const passed = new Set(obs.auction.filter((e) => e.kind === 'pass').map((e) => e.seat));
  const lastBid = [...obs.auction].reverse().find((e) => e.kind === 'bid');
  const high =
    lastBid && lastBid.kind === 'bid' ? { seat: lastBid.seat, amount: lastBid.amount } : null;
  const belief = buildBelief(obs);
  let wSum = 0;
  let declare = 0;
  let pass = 0;
  let price = 0;
  const share = { self: 0, partner: 0, opponent: 0 };
  const extra = modes.map(() => ({ declare: 0, pass: 0 }));
  for (let i = 0; i < opts.bidWorlds; i++) {
    if (i >= MIN_WORLDS && Date.now() > deadline) break;
    const deal = toDeal(obs, belief.sample(rng));
    const w = auctionLikelihood(deal, obs, step, opts.auctionSigma, opts);
    if (w < 1e-9) continue;
    // The others still in, with their ceilings by the model.
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
    // If we bid the minimum: we declare at it, or (bidOutcome 'auction') an opponent who would
    // pay the next price overcalls, we drop out and the others finish the auction.
    const after =
      opts.bidOutcome === 'auction'
        ? afterOurBid(ceilings, obs.seat, legal.minBid, raise, step)
        : null;
    const ours = after ?? { seat: obs.seat, price: legal.minBid };
    const mineAt = declareValue(deal, ours.seat, opts);
    const mine = mineAt(utilityFor(obs, ours.seat, ours.price, opts.utility));
    // If we pass: the others finish the auction by the model.
    const outcome = predictAuction(ceilings, high, legal.minBid, raise, step) ?? {
      seat: obs.seat,
      price: legal.minBid,
    };
    const theirsAt = declareValue(deal, outcome.seat, opts);
    const theirs = theirsAt(utilityFor(obs, outcome.seat, outcome.price, opts.utility));
    modes.forEach((mode, k) => {
      const e = extra[k] as { declare: number; pass: number };
      e.declare += w * mineAt(utilityFor(obs, ours.seat, ours.price, mode));
      e.pass += w * theirsAt(utilityFor(obs, outcome.seat, outcome.price, mode));
    });
    wSum += w;
    declare += w * mine;
    pass += w * theirs;
    price += w * outcome.price;
    if (outcome.seat === obs.seat) share.self += w;
    else if (teamOf(outcome.seat) === teamOf(obs.seat)) share.partner += w;
    else share.opponent += w;
  }
  if (wSum === 0) return null;
  return {
    declare: declare / wSum,
    pass: pass / wSum,
    worlds: wSum,
    ifPass: {
      self: share.self / wSum,
      partner: share.partner / wSum,
      opponent: share.opponent / wSum,
    },
    passPrice: price / wSum,
    byMode: extra.map((e) => ({ declare: e.declare / wSum, pass: e.pass / wSum })),
  };
}

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
  const lastBid = [...obs.auction].reverse().find((e) => e.kind === 'bid');
  if (!opts.raisePartner && lastBid && teamOf(lastBid.seat) === teamOf(obs.seat)) {
    return { type: 'pass' };
  }
  const e = evaluateBid(obs, rng, opts, deadline);
  if (!e) return { type: 'pass' };
  return e.declare - e.pass >= opts.bidMargin
    ? { type: 'bid', amount: legal.minBid }
    : { type: 'pass' };
}

/**
 * On a first turn to bid with a weak enough hand: call a misdeal when going on with this
 * hand (bidding the minimum or passing, whichever is worth more from the auction as it
 * stands) is worth less than an average fresh deal. Null: go on and bid or pass.
 */
export function decideMisdeal(
  obs: Observation,
  rng: Rng,
  opts: ContractOptions,
  deadline = Number.POSITIVE_INFINITY,
): Action | null {
  const legal = obs.legal;
  if (legal.kind !== 'bid' || !legal.canCallMisdeal) return null;
  const e = evaluateBid(obs, rng, opts, deadline);
  if (!e) return null;
  const keep = legal.canPass ? Math.max(e.declare, e.pass) : e.declare;
  const redeal =
    opts.utility === 'equity' ? startEquity(ME_TABLE, obs.scores, teamOf(obs.seat), obs.dealer) : 0;
  return keep < redeal ? { type: 'callMisdeal' } : null;
}

export interface Candidate {
  readonly keep: readonly CardId[];
  readonly trump: Suit;
  readonly discard: readonly CardId[];
}

export interface RankedCandidate {
  readonly candidate: Candidate;
  /** The deciding team's value in `opts.utility` (re-checked, or screened only). */
  readonly value: number;
  /** Whether `value` comes from the re-check search rather than the screen. */
  readonly refined: boolean;
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
  return (rankCandidates(obs, rng, candidates, opts, deadline)[0] as RankedCandidate).candidate;
}

/**
 * Every candidate valued, best first: the re-checked ones (in the order of their re-check
 * value) ahead of those only screened. The first is the one the bot plays.
 */
export function rankCandidates(
  obs: Observation,
  rng: Rng,
  candidates: readonly Candidate[],
  opts: ContractOptions,
  deadline = Number.POSITIVE_INFINITY,
): RankedCandidate[] {
  const contract = obs.contract;
  if (!contract) throw new Error('no contract');
  const belief = buildBelief(obs);
  const raw = utilityFor(obs, contract.bidder, contract.amount, opts.utility);
  const u = opts.calibScreen ? calibrated(raw, teamOf(contract.bidder), opts) : raw;
  const screenDeals = Array.from({ length: opts.screenWorlds }, () => belief.sample(rng));
  const team = teamOf(obs.seat);
  const screened = candidates.map((c) => {
    let total = 0;
    for (const world of screenDeals) {
      const hands = [0, 1, 2, 3].map((s) => (s === obs.seat ? c.keep : (world.hands[s] ?? [])));
      if (opts.screenValue === 'model') {
        // The contract-value model's capture, Normal around its prediction (as in bidding).
        const playout: [number, number] = [0, 0];
        const x = contractFeaturesWith(hands, obs.seat, c.keep, c.trump, undefined, playout);
        const mean = predictCapture(CONTRACT_MODEL, x);
        total += calibrated(raw, team, { calibA: mean, calibB: 0, calibSd: CONTRACT_MODEL.sd })(
          playout,
        );
      } else {
        total += u(playoutWith(hands, obs.seat, c.keep, c.trump));
      }
    }
    return { c, value: total / screenDeals.length };
  });
  screened.sort((a, b) => b.value - a.value);
  const top = screened.slice(0, opts.refineTop);
  const screenedOnly = (from: number): RankedCandidate[] =>
    screened.slice(from).map((s) => ({ candidate: s.c, value: s.value, refined: false }));
  if (opts.refineWorlds <= 0 || top.length <= 1) return screenedOnly(0);

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
  const refined: RankedCandidate[] = [];
  refine: for (const t of top) {
    let total = 0;
    for (const world of refineDeals) {
      const hands = [0, 1, 2, 3].map((s) => (s === obs.seat ? t.c.keep : (world.hands[s] ?? [])));
      const state = buildPlayState({
        hands,
        trump: t.c.trump,
        tricks: [],
        currentTrick: null,
        turn: openingLeader(obs.seat),
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
    refined.push({ candidate: t.c, value: total / refineDeals.length, refined: true });
  }
  if (refined.length === 0) return screenedOnly(0);
  // A stable sort keeps the screen's order among equal values, as the strict '>' did.
  refined.sort((a, b) => b.value - a.value);
  return [...refined, ...screenedOnly(refined.length)];
}

/**
 * The (discard, trump) plans a bidder holding 16 cards considers. `include` adds a discard
 * of the caller's own (with every trump), so that it is valued alongside the rest.
 */
export function discardPlans(
  hand: readonly CardId[],
  include: readonly CardId[] | null = null,
): Candidate[] {
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  const add = (discard: readonly CardId[], trump: Suit) => {
    const key = `${[...discard].sort((a, b) => a - b).join(',')}|${trump}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ discard, trump, keep: hand.filter((c) => !discard.includes(c)) });
  };
  for (const trump of SUITS) {
    for (const discard of discardCandidates(hand, trump)) add(discard, trump);
  }
  if (include) for (const trump of SUITS) add(include, trump);
  return candidates;
}

export function decideDiscard(
  obs: Observation,
  rng: Rng,
  opts: ContractOptions,
  deadline = Number.POSITIVE_INFINITY,
): Action {
  const legal = obs.legal;
  if (legal.kind !== 'discard') throw new Error('decideDiscard outside discarding');
  const candidates = discardPlans(obs.hand);
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
