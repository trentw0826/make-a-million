// Regenerate with `packages/sim/scripts/policy-model.ts` (WRITE=1). Do not edit by hand.
// Placeholder until the first fit: every weight zero, a player who picks uniformly among the
// legal cards.
import type { PolicyModel } from '../policy';

export const POLICY_MODEL: PolicyModel = {
  source: 'placeholder: uniform over the legal cards',
  features: ["tiger","bull","bear","trump card","money","lead × boss","lead × suit length","lead × trump","lead × money","partner winning × money","opponent winning × wins","opponent winning × wins × trick money","last × wins","off-suit throw × money","lowest of its suit","highest of its suit","rank","partner winning × wins","bull × partner winning","bear × opponent winning","bull × trick money","bear × trick money","boss","ruff"],
  weights: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
};
