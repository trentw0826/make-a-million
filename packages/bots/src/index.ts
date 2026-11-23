import { EXPERT_DEFAULTS, HARD_DEFAULTS, HardBot } from './hard/index';
import { HeuristicBot } from './heuristic/index';
import { RandomBot } from './random';
import type { BotStrategy, Difficulty } from './strategy';

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
} from './hard/index';
export { ceilingForHand } from './heuristic/bidding';
export { HeuristicBot } from './heuristic/index';
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
