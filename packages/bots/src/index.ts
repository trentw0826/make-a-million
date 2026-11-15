import { EXPERT_DEFAULTS, HARD_DEFAULTS, HardBot } from './hard/index';
import { HeuristicBot } from './heuristic/index';
import { RandomBot } from './random';
import type { BotStrategy, Difficulty } from './strategy';

export { CONTRACT_DEFAULTS, type ContractOptions } from './contract/index';
export { fallbackAction } from './fallback';
export {
  EXPERT_DEFAULTS,
  HARD_DEFAULTS,
  HardBot,
  type HardOptions,
  PIMC_DEFAULTS,
  type PimcOptions,
  type PimcResult,
  pimcValues,
} from './hard/index';
export { HeuristicBot } from './heuristic/index';
export { RandomBot } from './random';
export {
  type BotStrategy,
  CHEAP_DIFFICULTIES,
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
