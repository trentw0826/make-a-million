import { HeuristicBot } from './heuristic/index';
import { RandomBot } from './random';
import type { BotStrategy, Difficulty } from './strategy';

export { fallbackAction } from './fallback';
export { HeuristicBot } from './heuristic/index';
export { RandomBot } from './random';
export {
  type BotStrategy,
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
  }
}
