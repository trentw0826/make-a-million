import { type CardId, partnerOf, type Seat, SUITS, type Suit } from '@mam/engine';
import { type Deal, heuristicContract, playoutWith } from './simulate';

/**
 * Features of a contract for a contract-value model: what the declaring team can expect to
 * capture if `declarer` takes this deal. The deal is a world sampled from the deciding seat's
 * observation (as for the greedy playout, `playoutDeclare`), never the true one at the table.
 * The declarer's keep and trump are the heuristic's, as in the playout; money in $1000s.
 */
export const CONTRACT_FEATURES = [
  'bias',
  'estimate',
  'estimate²/100',
  'money declarer',
  'money partner',
  'money left (leads)',
  'money right',
  'trumps declarer',
  'trumps partner',
  'trumps left',
  'trumps right',
  'tiger ours',
  'bull ours',
  'bear ours',
  'bull theirs',
  'bear theirs',
  'top trumps ours',
  'side aces ours',
  'side aces theirs',
  'voids declarer',
  'singletons declarer',
  'voids partner',
  'longest opposing trumps',
] as const;

export const CONTRACT_FEATURE_COUNT = CONTRACT_FEATURES.length;

const TIGER = 52;
const BULL = 53;
const BEAR = 54;
const MONEY_K = [0, 0, 0, 0, 5, 0, 0, 0, 10, 0, 15, 30, 40] as const;

function money(cards: readonly CardId[]): number {
  let m = 0;
  for (const c of cards) if (c < 52) m += MONEY_K[c % 13] as number;
  return m;
}

/** Cards of each suit (0–3) in a hand. */
function suitCounts(cards: readonly CardId[]): number[] {
  const n = [0, 0, 0, 0];
  for (const c of cards) if (c < 52) n[(c / 13) | 0] = (n[(c / 13) | 0] as number) + 1;
  return n;
}

/**
 * Fills `out` with the features of `declarer` declaring `deal`; returns it. `playout`, if
 * given, receives the greedy playout's capture by team 0 and team 1 ($1000s).
 */
export function contractFeatures(
  deal: Deal,
  declarer: Seat,
  out: Float64Array = new Float64Array(CONTRACT_FEATURE_COUNT),
  playout?: [number, number],
): Float64Array {
  const cards16 = [...(deal.hands[declarer] ?? []), ...deal.widow];
  const { keep, trump } = heuristicContract(cards16);
  return contractFeaturesWith(deal.hands, declarer, keep, trump, out, playout);
}

/**
 * The same features for a contract whose keep (the declarer's final 13 cards) and trump are
 * given, as when choosing the discard and trump; `hands` are the other seats' cards.
 */
export function contractFeaturesWith(
  hands: readonly (readonly CardId[])[],
  declarer: Seat,
  keep: readonly CardId[],
  trump: Suit,
  out: Float64Array = new Float64Array(CONTRACT_FEATURE_COUNT),
  playout?: [number, number],
): Float64Array {
  const deal = { hands };
  const t = SUITS.indexOf(trump);
  const team = declarer % 2;
  const pair = playoutWith(deal.hands, declarer, keep, trump);
  if (playout) {
    playout[0] = pair[0];
    playout[1] = pair[1];
  }
  const est = pair[team] as number;
  const partner = partnerOf(declarer);
  const left = ((declarer + 1) % 4) as Seat;
  const right = ((declarer + 3) % 4) as Seat;
  const handOf = (s: Seat): readonly CardId[] => (s === declarer ? keep : (deal.hands[s] ?? []));
  const d = handOf(declarer);
  const p = handOf(partner);
  const l = handOf(left);
  const r = handOf(right);
  const ours = [...d, ...p];
  const theirs = [...l, ...r];
  const has = (cards: readonly CardId[], c: CardId) => (cards.includes(c) ? 1 : 0);
  const sd = suitCounts(d);
  const sp = suitCounts(p);
  const trumpsOf = (cards: readonly CardId[]) => suitCounts(cards)[t] as number;
  let topTrumps = has(ours, TIGER);
  for (const rank of [10, 11, 12]) topTrumps += has(ours, t * 13 + rank);
  let acesOurs = 0;
  let acesTheirs = 0;
  let voidsD = 0;
  let singlesD = 0;
  let voidsP = 0;
  for (let s = 0; s < 4; s++) {
    if (s === t) continue;
    acesOurs += has(ours, s * 13 + 12);
    acesTheirs += has(theirs, s * 13 + 12);
    if (sd[s] === 0) voidsD += 1;
    if (sd[s] === 1) singlesD += 1;
    if (sp[s] === 0) voidsP += 1;
  }
  const values = [
    1,
    est,
    (est * est) / 100,
    money(d),
    money(p),
    money(l),
    money(r),
    trumpsOf(d),
    trumpsOf(p),
    trumpsOf(l),
    trumpsOf(r),
    has(ours, TIGER),
    has(ours, BULL),
    has(ours, BEAR),
    has(theirs, BULL),
    has(theirs, BEAR),
    topTrumps,
    acesOurs,
    acesTheirs,
    voidsD,
    singlesD,
    voidsP,
    Math.max(trumpsOf(l), trumpsOf(r)),
  ];
  for (let i = 0; i < CONTRACT_FEATURE_COUNT; i++) out[i] = values[i] as number;
  return out;
}

/** A linear contract-value model: capture ~ Normal(weights · features, sd²), in $1000s. */
export interface ContractModel {
  readonly source: string;
  readonly features: readonly string[];
  readonly weights: readonly number[];
  readonly sd: number;
}

/** The model's mean capture ($1000s) for the declaring team. */
export function predictCapture(model: ContractModel, x: Float64Array): number {
  let y = 0;
  for (let i = 0; i < model.weights.length; i++)
    y += (model.weights[i] as number) * (x[i] as number);
  return y;
}
