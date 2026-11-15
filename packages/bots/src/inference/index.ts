import {
  type CardId,
  cardById,
  currentWinner,
  type Observation,
  type Seat,
  SUITS,
  type Suit,
  type Trick,
} from '@mam/engine';
import type { World } from '@mam/search';
import { auctionLikelihood, type Deal } from '../contract/simulate';
import { expectedCapture } from '../heuristic/evaluate';

export interface InferenceOptions {
  /** > 1 flattens the model so unusual (e.g. human) play does not mislead the bot. */
  readonly temperature: number;
  /** Also use throw-offs: a void player under an opponent's trick sheds their cheapest card. */
  readonly throwOffs: boolean;
  /** Likelihood factor when a cheaper card was available but not thrown. */
  readonly throwOffMiss: number;
}

export const INFERENCE_DEFAULTS: InferenceOptions = {
  temperature: 1.5,
  throwOffs: false,
  throwOffMiss: 0.35,
};

/** How "cheap" a card is to throw away: low number cards first, keep Money and trumps. */
function throwCost(card: CardId, trump: Suit): number {
  const c = cardById(card);
  if (c.kind !== 'suit') return 1000;
  const money = card % 13 >= 10 || card % 13 === 4 || card % 13 === 8;
  return (money ? 40 : 0) + (card % 13) + (c.suit === trump ? 30 : 0);
}

interface ThrowOff {
  readonly seat: Seat;
  readonly card: CardId;
  /** Cards the seat played at or after this one (part of its holding at the time). */
  readonly later: readonly CardId[];
}

/** Plays where a seat could not follow and threw a plain card under an opponent's lead. */
function throwOffs(obs: Observation): ThrowOff[] {
  const trump = obs.trump;
  if (trump === null) return [];
  const tricks: Trick[] = [...obs.tricks, ...(obs.currentTrick ? [obs.currentTrick] : [])];
  const sequence: { seat: Seat; card: CardId }[] = tricks.flatMap((t) =>
    t.plays.map((p) => ({ seat: p.seat, card: p.cardId })),
  );
  const out: ThrowOff[] = [];
  let index = 0;
  for (const t of tricks) {
    let suit: Suit | null = null;
    t.plays.forEach((p, i) => {
      const card = cardById(p.cardId);
      const prefix: Trick = { ...t, plays: t.plays.slice(0, i), suit, winner: null };
      if (
        p.seat !== obs.seat &&
        suit !== null &&
        card.kind === 'suit' &&
        card.suit !== suit &&
        card.suit !== trump
      ) {
        const winning = i > 0 ? currentWinner(prefix, trump) : null;
        if (winning && (winning.seat + p.seat) % 2 === 1) {
          const later = sequence
            .slice(index + i)
            .filter((x) => x.seat === p.seat)
            .map((x) => x.card);
          out.push({ seat: p.seat, card: p.cardId, later });
        }
      }
      if (suit === null && card.kind === 'suit') suit = card.suit;
      if (suit === null && card.kind === 'tiger') suit = trump;
    });
    index += t.plays.length;
  }
  return out;
}

/**
 * Soft inference for card play: how well a sampled world explains the public evidence,
 * under a model of how players bid and choose trump (the heuristic bot's), and optionally of
 * how they throw off. Worlds are then resampled in proportion to this weight. The model is
 * tempered so that a human who plays differently does not make the bot certain of wrong things.
 */
export function makeWorldWeight(
  obs: Observation,
  options: Partial<InferenceOptions> = {},
): (world: World) => number {
  const o = { ...INFERENCE_DEFAULTS, ...options };
  const played = new Map<Seat, CardId[]>();
  for (const t of [...obs.tricks, ...(obs.currentTrick ? [obs.currentTrick] : [])]) {
    for (const p of t.plays) {
      const list = played.get(p.seat) ?? [];
      list.push(p.cardId);
      played.set(p.seat, list);
    }
  }
  const step = obs.ruleset.bidding.bidStep;
  const bidder = obs.contract?.bidder ?? null;
  const trump = obs.trump;
  const trumpEvidence = trump !== null && bidder !== null && bidder !== obs.seat;
  const throws = o.throwOffs ? throwOffs(obs) : [];

  return (world) => {
    // Each seat's 13 cards at the time of the auction (held now + already played).
    const hands = [0, 1, 2, 3].map((s) =>
      s === obs.seat ? obs.hand : [...(world.hands[s] ?? []), ...(played.get(s as Seat) ?? [])],
    );
    const deal: Deal = { hands, widow: world.pile };
    let w = auctionLikelihood(deal, obs, step);
    if (trumpEvidence) {
      // The bidder named the suit their final 13 cards valued most.
      const cards = (hands[bidder] ?? []).map(cardById);
      const values = SUITS.map((s) => expectedCapture(cards, s));
      const max = Math.max(...values);
      const z = values.reduce((a, v) => a + Math.exp((v - max) / 25_000), 0);
      w *= Math.exp(((values[SUITS.indexOf(trump)] as number) - max) / 25_000) / z;
    }
    if (trump !== null) {
      for (const t of throws) {
        // The thrower's holding then: what it holds now plus what it played from then on.
        const holding = [...(world.hands[t.seat] ?? []), ...t.later];
        const cost = throwCost(t.card, trump);
        const cheaper = holding.some((c) => c !== t.card && throwCost(c, trump) < cost);
        if (cheaper) w *= o.throwOffMiss;
      }
    }
    return w ** (1 / o.temperature);
  };
}
