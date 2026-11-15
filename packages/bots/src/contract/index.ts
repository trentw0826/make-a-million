import {
  type Action,
  type CardId,
  type Observation,
  type Rng,
  type Seat,
  SUITS,
  type Suit,
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
}

export const CONTRACT_DEFAULTS: ContractOptions = {
  bidWorlds: 160,
  screenWorlds: 40,
  refineWorlds: 12,
  refineTop: 4,
  refineDepth: 1,
  utility: 'equity',
  bidMargin: 0,
  raisePartner: false,
  auctionSigma: 20_000,
};

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
    const w = auctionLikelihood(deal, obs, step, opts.auctionSigma);
    if (w < 1e-9) continue;
    const mine = utilityFor(
      obs,
      obs.seat,
      legal.minBid,
      opts.utility,
    )(playoutDeclare(deal, obs.seat));
    // If we pass: the others (still in) finish the auction by the model.
    const ceilings = new Map<Seat, number>();
    for (const s of [0, 1, 2, 3] as Seat[]) {
      if (s === obs.seat || passed.has(s)) continue;
      ceilings.set(
        s,
        s === high?.seat
          ? Math.max(high.amount, modelCeiling(deal, s, obs, step))
          : modelCeiling(deal, s, obs, step),
      );
    }
    const outcome = predictAuction(ceilings, high, legal.minBid, raise, step) ?? {
      seat: obs.seat,
      price: legal.minBid,
    };
    const theirs = utilityFor(
      obs,
      outcome.seat,
      outcome.price,
      opts.utility,
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
    for (const s of [0, 1, 2, 3] as Seat[]) ceilings.set(s, modelCeiling(deal, s, obs, bidStep));
    const outcome = predictAuction(ceilings, null, minOpeningBid, raiseIncrement, bidStep) ?? {
      seat: opener,
      price: minOpeningBid,
    };
    keep += utilityFor(
      obs,
      outcome.seat,
      outcome.price,
      opts.utility,
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
  // Past the deadline, the best candidate among those fully re-checked wins (the screen's
  // best is re-checked first).
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
      solver.depthTricks = opts.refineDepth;
      solver.nodeLimit = solver.nodes + 2_000_000;
      let v0: number;
      try {
        v0 = solver.solve(state);
      } catch (e) {
        if (e instanceof DeadlineExceeded) break refine;
        if (!(e instanceof SearchAborted)) throw e;
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
