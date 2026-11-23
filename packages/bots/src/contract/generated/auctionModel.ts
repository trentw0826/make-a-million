// Regenerate with `packages/sim/scripts/auction-model.ts` (WRITE=1). Do not edit by hand.
// Placeholder until the first fit: the heuristic's ceilings at the default scale (σ = 20k).
import type { AuctionModel } from '../auction';

export const AUCTION_MODEL: AuctionModel = {
  source: 'placeholder: the heuristic ceilings, σ 20k',
  features: ["bias","money","best suit value","heuristic ceiling","tiger","bull","bear","longest suit","partner has bid"],
  weights: [0,0,0,10,0,0,0,0,0],
  priceWeight: 10,
};
