import { type Action, type CardId, cardById, type Observation, partnerOf } from '@mam/engine';
import type { Analysis } from './analysis';
import { bestTrump } from './evaluate';

/** Safety margin below the hand's estimated value. */
const MARGIN = 25_000;
/** Picking up the widow and discarding three low cards improves the hand. */
const WIDOW_BONUS = 20_000;
/** A partner who has bid promises some strength. */
const PARTNER_BID_BONUS = 15_000;

export function chooseBid(a: Analysis): Action {
  const legal = a.obs.legal;
  if (legal.kind !== 'bid') throw new Error('chooseBid outside bidding');
  if (!legal.canPass) return { type: 'bid', amount: legal.minBid };

  const ceiling = bidCeiling(a.obs, legal.step);
  return legal.minBid <= ceiling ? { type: 'bid', amount: legal.minBid } : { type: 'pass' };
}

/** The most this seat is willing to bid, rounded down to the bid step. */
export function bidCeiling(obs: Observation, step: number): number {
  const partnerBid = obs.auction.some((e) => e.kind === 'bid' && e.seat === partnerOf(obs.seat));
  return ceilingForHand(obs.hand, partnerBid, step);
}

/** The heuristic ceiling for any 13-card hand (used to model other players' bidding). */
export function ceilingForHand(hand: readonly CardId[], partnerBid: boolean, step: number): number {
  const { value } = bestTrump(hand.map(cardById));
  const raw = value + WIDOW_BONUS + (partnerBid ? PARTNER_BID_BONUS : 0) - MARGIN;
  return Math.floor(raw / step) * step;
}
