import {
  BEAR_ID,
  BULL_ID,
  type CardId,
  cardById,
  currentWinner,
  effectiveSuit,
  type Observation,
  type Seat,
  type Suit,
  sumMoney,
  TIGER_ID,
  type Trick,
} from '@mam/engine';
import type { World } from '@mam/search';
import { SPECIALS_MODEL } from './generated/specialsModel';

/**
 * Inference about the Tiger, Bull and Bear from card play. A player holding one of them who
 * could have played it but played something else makes worlds where they hold it less
 * likely, by how often players (Hard, in self-play) play it in that situation. Knowing where
 * these three cards are is worth about 21k a hand to Hard (docs/bot-ladder.md, `peek`).
 */

/** The specials, in model order. */
export const SPECIALS: readonly CardId[] = [TIGER_ID, BULL_ID, BEAR_ID];

const REL = 3; // nobody winning yet, partner winning, opponent winning
const POS = 4; // position in the trick, 0 = lead
const MONEY = 5;
const STAGE = 3;
const MOD = 3; // Bull or Bear already in the trick: none, Bull last, Bear last

/** Coarse cells: special × who is winning × last to play × money in the trick. */
export const COARSE_CELLS = SPECIALS.length * REL * 2 * MONEY;
/** Fine cells: special × who is winning × position × money × stage of the hand × modifier. */
export const FINE_CELLS = SPECIALS.length * REL * POS * MONEY * STAGE * MOD;

function moneyBucket(money: number): number {
  if (money <= 0) return 0;
  if (money <= 20_000) return 1;
  if (money <= 40_000) return 2;
  if (money <= 70_000) return 3;
  return 4;
}

export interface Opportunity {
  readonly fine: number;
  readonly coarse: number;
}

/**
 * The model's cells for `seat` being able to play `special` into `prefix` (the plays before
 * its own) with `handSize` cards in hand.
 */
export function opportunity(
  special: CardId,
  prefix: Trick,
  trump: Suit,
  seat: Seat,
  handSize: number,
): Opportunity {
  const s = SPECIALS.indexOf(special);
  const winner = currentWinner(prefix, trump);
  const rel = winner === null ? 0 : (winner.seat + seat) % 2 === 0 ? 1 : 2;
  const pos = prefix.plays.length;
  const money = moneyBucket(sumMoney(prefix.plays.map((p) => p.cardId)));
  const stage = handSize >= 9 ? 0 : handSize >= 5 ? 1 : 2;
  let mod = 0;
  for (const p of prefix.plays) {
    if (p.cardId === BULL_ID) mod = 1;
    else if (p.cardId === BEAR_ID) mod = 2;
  }
  const coarse = ((s * REL + rel) * 2 + (pos === 3 ? 1 : 0)) * MONEY + money;
  const fine = ((((s * REL + rel) * POS + pos) * MONEY + money) * STAGE + stage) * MOD + mod;
  return { fine, coarse };
}

/** Whether `special` would have been a legal play for whoever played `card` into `prefix`. */
export function couldPlay(special: CardId, card: CardId, prefix: Trick, trump: Suit): boolean {
  if (card === special) return false;
  const suit = prefix.suit;
  const followed = suit !== null && effectiveSuit(cardById(card), trump) === suit;
  if (special === TIGER_ID) {
    // The Tiger may always be led, and counts as trump when following.
    return prefix.plays.length === 0 || suit === null || suit === trump || !followed;
  }
  // Bull and Bear: led only as the last cards (no choice then); otherwise playable when the
  // trick has no suit yet or the player cannot follow.
  if (prefix.plays.length === 0) return false;
  return suit === null || !followed;
}

/** Each trick of the hand so far, as (prefix, play) pairs in play order. */
export function* playsWithPrefix(
  tricks: readonly Trick[],
  trump: Suit,
): Generator<{ prefix: Trick; seat: Seat; card: CardId; trickIndex: number }> {
  let trickIndex = 0;
  for (const t of tricks) {
    let suit: Suit | null = null;
    for (let i = 0; i < t.plays.length; i++) {
      const p = t.plays[i] as Trick['plays'][number];
      const prefix: Trick = { ...t, plays: t.plays.slice(0, i), suit, winner: null };
      yield { prefix, seat: p.seat, card: p.cardId, trickIndex };
      if (suit === null) suit = effectiveSuit(cardById(p.cardId), trump);
    }
    trickIndex += 1;
  }
}

export interface SpecialsModel {
  readonly source: string;
  /** P(play the special | opportunity), smoothed, by fine cell. */
  readonly pPlay: readonly number[];
}

export interface SpecialsInferenceOptions {
  /** > 1 flattens the model so unusual (e.g. human) play does not mislead the bot. */
  readonly temperature: number;
  /** Most a single missed opportunity may cut a world's weight (keeps every world possible). */
  readonly floor: number;
}

export const SPECIALS_INFERENCE_DEFAULTS: SpecialsInferenceOptions = {
  temperature: 1.5,
  floor: 0.05,
};

/**
 * World weight from the specials evidence (undefined when there is none). Each unseen
 * special's holder in a world is charged Π(1 − P(play)) over the opportunities it passed up.
 */
export function makeSpecialsWeight(
  obs: Observation,
  options: Partial<SpecialsInferenceOptions> = {},
  model: SpecialsModel = SPECIALS_MODEL,
): ((world: World) => number) | undefined {
  const o = { ...SPECIALS_INFERENCE_DEFAULTS, ...options };
  const trump = obs.trump;
  if (trump === null) return undefined;
  const tricks: Trick[] = [...obs.tricks, ...(obs.currentTrick ? [obs.currentTrick] : [])];
  const played = new Set(tricks.flatMap((t) => t.plays.map((p) => p.cardId)));
  const unseen = SPECIALS.filter((c) => !played.has(c) && !obs.hand.includes(c));
  if (unseen.length === 0) return undefined;
  // factor[special][seat]: how much less likely that seat holds it, given its plays.
  const factor = unseen.map(() => [1, 1, 1, 1]);
  for (const { prefix, seat, card, trickIndex } of playsWithPrefix(tricks, trump)) {
    if (seat === obs.seat) continue;
    unseen.forEach((special, k) => {
      if (!couldPlay(special, card, prefix, trump)) return;
      const cell = opportunity(special, prefix, trump, seat, 13 - trickIndex);
      const p = model.pPlay[cell.fine] ?? 0;
      const f = factor[k] as number[];
      f[seat] = (f[seat] as number) * Math.max(o.floor, 1 - p);
    });
  }
  if (factor.every((f) => f.every((x) => x === 1))) return undefined;
  const exponent = 1 / o.temperature;
  return (world) => {
    let w = 1;
    unseen.forEach((special, k) => {
      const f = factor[k] as number[];
      for (const s of [0, 1, 2, 3] as Seat[]) {
        if (s !== obs.seat && world.hands[s]?.includes(special)) w *= f[s] as number;
      }
    });
    return w ** exponent;
  };
}
