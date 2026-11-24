import { EXPERT_DEFAULTS, HARD_DEFAULTS, HardBot } from './hard/index';
import { HeuristicBot } from './heuristic/index';
import { RandomBot } from './random';
import type { BotStrategy, Difficulty } from './strategy';

export {
  ANALYSIS_DEFAULTS,
  type Analysis,
  type AnalysisOptions,
  analyze,
  analyzeDecision,
  analyzePosition,
  type Decision,
  type DecisionKind,
  type DecisionOption,
  LABEL_LIMITS_K,
  labelFor,
  type MoveLabel,
  type MoveReview,
  reviewMove,
} from './analysis/index';
export {
  AUCTION_FEATURE_COUNT,
  AUCTION_FEATURES,
  type AuctionModel,
  auctionFeatures,
  fittedCeiling,
} from './contract/auction';
export {
  type BidEvaluation,
  CONTRACT_DEFAULTS,
  type ContractOptions,
  evaluateBid,
} from './contract/index';
export { type Deal, discardCandidates, playoutDeclare, playoutWith } from './contract/simulate';
export {
  CONTRACT_FEATURE_COUNT,
  CONTRACT_FEATURES,
  type ContractModel,
  contractFeatures,
  predictCapture,
} from './contract/value';
export { fallbackAction } from './fallback';
export {
  EXPERT_DEFAULTS,
  HARD_DEFAULTS,
  HardBot,
  type HardOptions,
  PIMC_DEFAULTS,
  type PimcCall,
  type PimcOptions,
  type PimcResult,
  pimcValues,
  worldWeight,
} from './hard/index';
export { ceilingForHand } from './heuristic/bidding';
export { HeuristicBot } from './heuristic/index';
export { POLICY_MODEL } from './inference/generated/policyModel';
export { makeWorldWeight } from './inference/index';
export {
  makePolicyWeight,
  PLAY_FEATURE_COUNT,
  PLAY_FEATURES,
  type PolicyModel,
  playFeatures,
  playProbabilities,
} from './inference/policy';
export {
  COARSE_CELLS,
  FINE_CELLS,
  makeSpecialsWeight,
  opportunity,
  SPECIALS,
  type SpecialsModel,
} from './inference/specials';
export { RandomBot } from './random';
export {
  type BotStrategy,
  CHEAP_DIFFICULTIES,
  type DecideContext,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  type Difficulty,
  isDifficulty,
} from './strategy';

/** The strategy behind each difficulty. Swap entries here to change what a level plays. */
export function createBot(difficulty: Difficulty): BotStrategy {
  switch (difficulty) {
    case 'easy':
      return new RandomBot();
    case 'normal':
      return new HeuristicBot();
    case 'hard':
      return new HardBot(HARD_DEFAULTS);
    case 'expert':
      return new HardBot(EXPERT_DEFAULTS);
  }
}
