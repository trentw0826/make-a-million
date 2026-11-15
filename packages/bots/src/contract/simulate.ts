import {
  type CardId,
  cardById,
  isNumberCard,
  type Observation,
  partnerOf,
  requiredNumberDiscards,
  type Seat,
  type Suit,
  teamOf,
} from '@mam/engine';
import {
  buildPlayState,
  type CaptureUtility,
  captureUtility,
  greedyPlayout,
  ME_TABLE,
  type UtilityMode,
} from '@mam/search';
import { ceilingForHand } from '../heuristic/bidding';
import { chooseDiscards } from '../heuristic/discard';
import { bestTrump } from '../heuristic/evaluate';

/** A complete deal: 13 cards per seat plus the 3-card widow. */
export interface Deal {
  readonly hands: readonly (readonly CardId[])[];
  readonly widow: readonly CardId[];
}

/** How the simulated declarer turns 16 cards into 13 and a trump (the heuristic's way). */
export function heuristicContract(cards16: readonly CardId[]): {
  keep: CardId[];
  trump: Suit;
} {
  const discard = chooseDiscards(cards16.map(cardById), requiredNumberDiscards(cards16));
  const keep = cards16.filter((c) => !discard.includes(c));
  return { keep, trump: bestTrump(keep.map(cardById)).suit };
}

/**
 * Money each team wins (in $1000s) if `declarer` takes the contract in this deal, picks up
 * the widow, chooses discards and trump with the heuristic, and everyone plays greedily
 * with all hands visible. A fast, rough estimate used for contract decisions.
 */
export function playoutDeclare(deal: Deal, declarer: Seat): [number, number] {
  const cards16 = [...(deal.hands[declarer] ?? []), ...deal.widow];
  const { keep, trump } = heuristicContract(cards16);
  return playoutWith(deal.hands, declarer, keep, trump);
}

/** Greedy open-hand playout with the declarer's final 13 cards and trump given. */
export function playoutWith(
  hands: readonly (readonly CardId[])[],
  declarer: Seat,
  keep: readonly CardId[],
  trump: Suit,
): [number, number] {
  const finalHands = hands.map((h, s) => (s === declarer ? keep : h));
  const state = buildPlayState({
    hands: finalHands,
    trump,
    tricks: [],
    currentTrick: null,
    turn: declarer,
  });
  const out = { d0: 0, d1: 0 };
  greedyPlayout(state, out);
  return [out.d0, out.d1];
}

/** The observer's value of a finished hand from captures in $1000s. */
export function utilityFor(
  obs: Observation,
  bidder: Seat,
  bid: number,
  mode: UtilityMode,
): (capK: readonly [number, number]) => number {
  const u: CaptureUtility = captureUtility(
    { ruleset: obs.ruleset, scores: obs.scores, dealer: obs.dealer, bidder, bid },
    teamOf(obs.seat),
    mode,
    ME_TABLE,
  );
  return (capK) => u([capK[0] * 1000, capK[1] * 1000]);
}

/**
 * A model of the other players' bidding: the heuristic ceiling of their hand in a sampled
 * deal. Used both to predict the rest of the auction and to weight deals by how well they
 * explain the bids and passes already made (soft inference).
 */
export function modelCeiling(
  deal: Deal,
  seat: Seat,
  obs: Observation,
  step: number,
  model: CeilingModel = HEURISTIC_CEILINGS,
): number {
  const partnerBid = obs.auction.some((e) => e.kind === 'bid' && e.seat === partnerOf(seat));
  const c = ceilingForHand(deal.hands[seat] ?? [], partnerBid, step);
  if (model.ceilingShift === 0 && model.ceilingScale === 1) return c;
  return Math.floor((model.ceilingShift + model.ceilingScale * c) / step) * step;
}

/**
 * How the other players' ceilings relate to the heuristic's: shift + scale × heuristic
 * ceiling ($). Identity models players who bid like the heuristic bot.
 */
export interface CeilingModel {
  readonly ceilingShift: number;
  readonly ceilingScale: number;
  /**
   * Whether a pass while the partner holds the high bid says the hand is weak (false for
   * players who never raise over their partner, like the bots).
   */
  readonly partnerPassInformative: boolean;
}

export const HEURISTIC_CEILINGS: CeilingModel = {
  ceilingShift: 0,
  ceilingScale: 1,
  partnerPassInformative: true,
};

/** Likelihood of the auction so far under the ceiling model (logistic, scale σ). */
export function auctionLikelihood(
  deal: Deal,
  obs: Observation,
  step: number,
  sigma = 20_000,
  model: CeilingModel = HEURISTIC_CEILINGS,
): number {
  let w = 1;
  let high = 0;
  let highSeat: Seat | null = null;
  const minOpen = obs.ruleset.bidding.minOpeningBid;
  const raise = obs.ruleset.bidding.raiseIncrement;
  for (const e of obs.auction) {
    const needed = high === 0 ? minOpen : high + raise;
    if (e.seat !== obs.seat) {
      const c = modelCeiling(deal, e.seat, obs, step, model);
      if (e.kind === 'bid') {
        // Forced opening bids carry no information.
        if (!(high === 0 && obs.ruleset.bidding.openerMustBid))
          w *= logistic((c - e.amount) / sigma);
      } else if (
        model.partnerPassInformative ||
        highSeat === null ||
        teamOf(highSeat) !== teamOf(e.seat)
      ) {
        w *= logistic((needed - c) / sigma);
      }
    }
    if (e.kind === 'bid') {
      high = e.amount;
      highSeat = e.seat;
    }
  }
  return w;
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x * 2));
}

/** Discard candidates for a 16-card hand: combinations of the most plausible cards to shed. */
export function discardCandidates(cards16: readonly CardId[], trump: Suit, limit = 6): CardId[][] {
  const required = requiredNumberDiscards(cards16);
  const lengths = new Map<string, number>();
  for (const c of cards16) {
    const card = cardById(c);
    if (card.kind === 'suit') lengths.set(card.suit, (lengths.get(card.suit) ?? 0) + 1);
  }
  const score = (c: CardId) => {
    const card = cardById(c);
    if (card.kind !== 'suit') return -1e9;
    const rank = c % 13;
    return (
      (card.suit === trump ? -100 : 0) + (13 - (lengths.get(card.suit) ?? 0)) * 3 + (12 - rank)
    );
  };
  const numbers = cards16
    .filter((c) => isNumberCard(cardById(c)))
    .sort((a, b) => score(b) - score(a))
    .slice(0, Math.max(required, limit));
  const money = cards16
    .filter((c) => cardById(c).kind === 'suit' && !isNumberCard(cardById(c)))
    .sort((a, b) => (a % 13) - (b % 13) + (score(b) - score(a)) / 1000)
    .slice(0, 4);
  const out: CardId[][] = [];
  for (const nums of combinations(numbers, required)) {
    if (required === 3) out.push(nums);
    else for (const extra of combinations(money, 3 - required)) out.push([...nums, ...extra]);
  }
  return out;
}

export function combinations<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      acc.push(items[i] as T);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}
