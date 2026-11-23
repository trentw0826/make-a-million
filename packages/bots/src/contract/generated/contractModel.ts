// Regenerate with `packages/sim/scripts/contract-model.ts` (WRITE=1). Do not edit by hand.
// Placeholder until the first fit: the default calibration of the greedy playout
// (130k + 0.5 × estimate, SD 58k), so contractValue 'model' plays like 'playout'.
import type { ContractModel } from '../value';

export const CONTRACT_MODEL: ContractModel = {
  source: 'placeholder: the default calibration (130k + 0.5 × estimate, SD 58k)',
  features: ["bias","estimate","estimate²/100","money declarer","money partner","money left (leads)","money right","trumps declarer","trumps partner","trumps left","trumps right","tiger ours","bull ours","bear ours","bull theirs","bear theirs","top trumps ours","side aces ours","side aces theirs","voids declarer","singletons declarer","voids partner","longest opposing trumps"],
  weights: [130,0.5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  sd: 58,
};
