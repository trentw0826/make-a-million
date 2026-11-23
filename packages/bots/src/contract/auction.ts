import { type CardId, cardById } from '@mam/engine';
import { ceilingForHand } from '../heuristic/bidding';
import { bestTrump } from '../heuristic/evaluate';

/**
 * A model of how the bots really bid, fitted on self-play auctions (scripts/auction-model.ts):
 * P(bid | hand, price) = logistic(weights · features(hand) − priceWeight × price/100k). Each
 * seat then has a ceiling, the price at which it is as likely to bid as to pass, and a scale,
 * which plug into the auction model of contract/index.ts in place of the heuristic's
 * ceilings (ContractOptions.ceilingModel). Decisions with partner holding the high bid and
 * the opener's forced bid carry no information about the hand and are left out.
 */
export const AUCTION_FEATURES = [
  'bias',
  'money',
  'best suit value',
  'heuristic ceiling',
  'tiger',
  'bull',
  'bear',
  'longest suit',
  'partner has bid',
] as const;

export const AUCTION_FEATURE_COUNT = AUCTION_FEATURES.length;

export interface AuctionModel {
  readonly source: string;
  readonly features: readonly string[];
  readonly weights: readonly number[];
  /** Weight of the price ($100k) against bidding. */
  readonly priceWeight: number;
}

const MONEY_K = [0, 0, 0, 0, 5, 0, 0, 0, 10, 0, 15, 30, 40] as const;

/** Features of a 13-card hand for the bidding model (money and values in $100k). */
export function auctionFeatures(
  hand: readonly CardId[],
  partnerBid: boolean,
  step: number,
  out: Float64Array = new Float64Array(AUCTION_FEATURE_COUNT),
): Float64Array {
  let money = 0;
  const counts = [0, 0, 0, 0];
  for (const c of hand) {
    if (c >= 52) continue;
    money += MONEY_K[c % 13] as number;
    counts[(c / 13) | 0] = (counts[(c / 13) | 0] as number) + 1;
  }
  out[0] = 1;
  out[1] = money / 100;
  out[2] = bestTrump(hand.map(cardById)).value / 100_000;
  out[3] = ceilingForHand(hand, partnerBid, step) / 100_000;
  out[4] = hand.includes(52) ? 1 : 0;
  out[5] = hand.includes(53) ? 1 : 0;
  out[6] = hand.includes(54) ? 1 : 0;
  out[7] = Math.max(...counts) / 13;
  out[8] = partnerBid ? 1 : 0;
  return out;
}

/** The seat's ceiling ($): the price at which the model has it bid half the time. */
export function fittedCeiling(
  model: AuctionModel,
  hand: readonly CardId[],
  partnerBid: boolean,
  step: number,
): number {
  const x = auctionFeatures(hand, partnerBid, step);
  let z = 0;
  for (let i = 0; i < model.weights.length; i++)
    z += (model.weights[i] as number) * (x[i] as number);
  // The epsilon keeps a ceiling that is a whole number of steps from flooring a step lower.
  return Math.floor(((z / model.priceWeight) * 100_000) / step + 1e-9) * step;
}

/**
 * The scale σ ($) of the logistic in auctionLikelihood (logistic(2x) of (ceiling − price)/σ)
 * that matches the model's price weight.
 */
export function fittedSigma(model: AuctionModel): number {
  return (2 * 100_000) / model.priceWeight;
}
