import {
  BEAR_ID,
  BULL_ID,
  type CardId,
  cardById,
  currentWinner,
  effectiveSuit,
  type Observation,
  playableCards,
  type Seat,
  SUITS,
  type Suit,
  TIGER_ID,
  type Trick,
} from '@mam/engine';
import type { World } from '@mam/search';
import { playsWithPrefix } from './specials';

/**
 * Policy-based inference (Rebstock, Solinas, Buro & Sturtevant 2019, for Skat): a sampled
 * world is weighted by how likely every other player's past plays are in it, under a model of
 * how players choose a card, P(card | hand, trick, history), fitted on the bots' own self-play
 * (scripts/policy-model.ts). It generalises the specials model, which looks only at the Tiger,
 * Bull and Bear. Every input is public or the world's; nothing carries over between decisions.
 */

/** The model's features of playing one card, in order. */
export const PLAY_FEATURES = [
  'tiger',
  'bull',
  'bear',
  'trump card',
  'money',
  'lead × boss',
  'lead × suit length',
  'lead × trump',
  'lead × money',
  'partner winning × money',
  'opponent winning × wins',
  'opponent winning × wins × trick money',
  'last × wins',
  'off-suit throw × money',
  'lowest of its suit',
  'highest of its suit',
  'rank',
  'partner winning × wins',
  'bull × partner winning',
  'bear × opponent winning',
  'bull × trick money',
  'bear × trick money',
  'boss',
  'ruff',
  'cheapest winner',
  'not winning × money',
  'second × wins',
  'third × wins',
  'lead × singleton',
  'cheapest card',
] as const;

export const PLAY_FEATURE_COUNT = PLAY_FEATURES.length;

/** A conditional-logit model of card play: P(c) ∝ exp(weights · features(c)) over the legal cards. */
export interface PolicyModel {
  readonly source: string;
  readonly features: readonly string[];
  readonly weights: readonly number[];
}

const MONEY_K = [0, 0, 0, 0, 5, 0, 0, 0, 10, 0, 15, 30, 40] as const;

function moneyOf(c: CardId): number {
  return c < 52 ? (MONEY_K[c % 13] as number) : 0;
}

function trickMoney(prefix: Trick): number {
  let m = 0;
  for (const p of prefix.plays) m += moneyOf(p.cardId);
  return m;
}

/** Strength of a card in a trick (engine order: Tiger, trumps by rank, the led suit by rank). */
function strength(c: CardId, suit: Suit | null, trump: Suit): number {
  if (c === TIGER_ID) return 1000;
  if (c >= 52) return -1;
  const s = SUITS[(c / 13) | 0] as Suit;
  if (s === trump) return 100 + (c % 13);
  if (suit !== null && s === suit) return c % 13;
  return -1;
}

/**
 * Features of each legal card for `seat` holding `hand` before playing into `prefix`, with
 * `played` the cards gone before this play (for which cards are boss). Row k of the result is
 * card `legal[k]`.
 */
export function playFeatures(
  hand: readonly CardId[],
  legal: readonly CardId[],
  prefix: Trick,
  trump: Suit,
  seat: Seat,
  played: ReadonlySet<CardId>,
): Float64Array[] {
  const pos = prefix.plays.length;
  const lead = pos === 0;
  const last = pos === 3;
  const winner = currentWinner(prefix, trump);
  const partnerWinning = winner !== null && (winner.seat + seat) % 2 === 0;
  const opponentWinning = winner !== null && !partnerWinning;
  const winStrength = winner === null ? -1 : strength(winner.cardId, prefix.suit, trump);
  const money = trickMoney(prefix) / 40;
  const own = new Set(hand);
  const t = SUITS.indexOf(trump);
  // Each suit's lowest and highest legal card, and own length.
  const lowest = new Map<number, CardId>();
  const highest = new Map<number, CardId>();
  const length = [0, 0, 0, 0];
  for (const c of hand) if (c < 52) length[(c / 13) | 0] = (length[(c / 13) | 0] as number) + 1;
  for (const c of legal) {
    if (c >= 52) continue;
    const s = (c / 13) | 0;
    if (!lowest.has(s) || c < (lowest.get(s) as number)) lowest.set(s, c);
    if (!highest.has(s) || c > (highest.get(s) as number)) highest.set(s, c);
  }
  // The cheapest card to give up (as the greedy playout ranks them) and the cheapest winner.
  const cost = (c: CardId) =>
    c === TIGER_ID
      ? 1000
      : c >= 52
        ? 500
        : moneyOf(c) * 4 + (c % 13) + (((c / 13) | 0) === t ? 30 : 0);
  let cheapest = legal[0] as CardId;
  for (const c of legal) if (cost(c) < cost(cheapest)) cheapest = c;
  let cheapestWin = -1;
  let cheapestWinStrength = Number.POSITIVE_INFINITY;
  for (const c of legal) {
    if (lead || c === BULL_ID || c === BEAR_ID) continue;
    const st = strength(c, prefix.suit ?? effectiveSuit(cardById(c), trump), trump);
    if (st > winStrength && st < cheapestWinStrength) {
      cheapestWinStrength = st;
      cheapestWin = c;
    }
  }
  return legal.map((c) => {
    const x = new Float64Array(PLAY_FEATURE_COUNT);
    const isSuit = c < 52;
    const s = isSuit ? (c / 13) | 0 : -1;
    const m = moneyOf(c) / 40;
    const trumpCard = isSuit && s === t;
    // The suit this card would set when nothing has yet.
    const suitNow = prefix.suit ?? effectiveSuit(cardById(c), trump);
    const wins =
      !lead && strength(c, suitNow, trump) > winStrength && c !== BULL_ID && c !== BEAR_ID;
    let boss = false;
    if (isSuit) {
      boss = true;
      for (let r = (c % 13) + 1; r < 13; r++) {
        const higher = s * 13 + r;
        if (!played.has(higher) && !own.has(higher)) {
          boss = false;
          break;
        }
      }
    }
    const offSuit =
      !lead && prefix.suit !== null && isSuit && SUITS[s] !== prefix.suit && !trumpCard;
    x[0] = c === TIGER_ID ? 1 : 0;
    x[1] = c === BULL_ID ? 1 : 0;
    x[2] = c === BEAR_ID ? 1 : 0;
    x[3] = trumpCard ? 1 : 0;
    x[4] = m;
    x[5] = lead && boss ? 1 : 0;
    x[6] = lead && isSuit ? (length[s] as number) / 13 : 0;
    x[7] = lead && (trumpCard || c === TIGER_ID) ? 1 : 0;
    x[8] = lead ? m : 0;
    x[9] = partnerWinning ? m : 0;
    x[10] = opponentWinning && wins ? 1 : 0;
    x[11] = opponentWinning && wins ? money : 0;
    x[12] = last && wins ? 1 : 0;
    x[13] = offSuit ? m : 0;
    x[14] = isSuit && lowest.get(s) === c ? 1 : 0;
    x[15] = isSuit && highest.get(s) === c ? 1 : 0;
    x[16] = isSuit ? (c % 13) / 12 : 0;
    x[17] = partnerWinning && wins ? 1 : 0;
    x[18] = c === BULL_ID && partnerWinning ? 1 : 0;
    x[19] = c === BEAR_ID && opponentWinning ? 1 : 0;
    x[20] = c === BULL_ID ? money : 0;
    x[21] = c === BEAR_ID ? money : 0;
    x[22] = boss ? 1 : 0;
    x[24] = c === cheapestWin ? 1 : 0;
    x[25] = !lead && !wins ? m : 0;
    x[26] = pos === 1 && wins ? 1 : 0;
    x[27] = pos === 2 && wins ? 1 : 0;
    x[28] = lead && isSuit && s !== t && length[s] === 1 ? 1 : 0;
    x[29] = c === cheapest ? 1 : 0;
    x[23] =
      !lead && prefix.suit !== null && prefix.suit !== trump && (trumpCard || c === TIGER_ID)
        ? 1
        : 0;
    return x;
  });
}

/** P(each legal card) under the model, in `legal`'s order. */
export function playProbabilities(model: PolicyModel, rows: readonly Float64Array[]): number[] {
  const w = model.weights;
  const scores = rows.map((x) => {
    let v = 0;
    for (let i = 0; i < w.length; i++) v += (w[i] as number) * (x[i] as number);
    return v;
  });
  const max = Math.max(...scores);
  const e = scores.map((v) => Math.exp(v - max));
  const z = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / z);
}

export interface PolicyInferenceOptions {
  /** > 1 flattens the weights so unusual (e.g. human) play does not mislead the bot. */
  readonly temperature: number;
  /** Share of the model in each play's likelihood; the rest is uniform over the legal cards. */
  readonly mix: number;
}

export const POLICY_INFERENCE_DEFAULTS: PolicyInferenceOptions = { temperature: 1.5, mix: 0.8 };

interface PastPlay {
  readonly seat: Seat;
  readonly card: CardId;
  readonly prefix: Trick;
  /** Cards the seat played at or after this play: part of its hand at the time. */
  readonly later: readonly CardId[];
  /** Cards gone before this play. */
  readonly played: ReadonlySet<CardId>;
}

/**
 * World weight from every other player's past card plays (undefined when there are none):
 * Π over plays of [mix · P_model(card | the seat's hand then) + (1 − mix) / legal], tempered.
 * A world in which a play was illegal gets weight 0 (the belief sampler never makes one).
 */
export function makePolicyWeight(
  obs: Observation,
  model: PolicyModel,
  options: Partial<PolicyInferenceOptions> = {},
): ((world: World) => number) | undefined {
  const o = { ...POLICY_INFERENCE_DEFAULTS, ...options };
  const trump = obs.trump;
  if (trump === null) return undefined;
  const tricks: Trick[] = [...obs.tricks, ...(obs.currentTrick ? [obs.currentTrick] : [])];
  const sequence = tricks.flatMap((t) => t.plays);
  const past: PastPlay[] = [];
  const gone = new Set<CardId>();
  let index = 0;
  for (const { prefix, seat, card } of playsWithPrefix(tricks, trump)) {
    if (seat !== obs.seat) {
      const later = sequence
        .slice(index)
        .filter((p) => p.seat === seat)
        .map((p) => p.cardId);
      past.push({ seat, card, prefix, later, played: new Set(gone) });
    }
    gone.add(card);
    index += 1;
  }
  if (past.length === 0) return undefined;
  const exponent = 1 / o.temperature;
  return (world) => {
    let logW = 0;
    for (const p of past) {
      const hand = [...(world.hands[p.seat] ?? []), ...p.later];
      const legal = playableCards(hand, p.prefix, trump);
      if (legal.length < 2) continue;
      const k = legal.indexOf(p.card);
      if (k < 0) return 0;
      const probs = playProbabilities(
        model,
        playFeatures(hand, legal, p.prefix, trump, p.seat, p.played),
      );
      logW += Math.log(o.mix * (probs[k] as number) + (1 - o.mix) / legal.length);
    }
    return Math.exp(logW * exponent);
  };
}
