import type { Action, Observation, Rng } from '@mam/engine';

/**
 * Every bot implements this. The Observation is the bot's only view of the game
 * (see docs/bot-standards.md): it can never contain other players' cards.
 */
export interface BotStrategy {
  /** Stable identifier, e.g. the difficulty it is registered under. */
  readonly id: string;
  decide(obs: Observation, rng: Rng, ctx?: DecideContext): Action | Promise<Action>;
}

/** Live-play conditions of one decision (simulations pass none). */
export interface DecideContext {
  /**
   * Wall-clock time (Date.now() ms) by which the answer is due. Searching bots stop early
   * and play their best move so far; budgets are normally sized so this never happens.
   */
  readonly deadline?: number;
}

export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard', 'expert'];

/** Levels cheap enough to run on the main thread and in large test batches. */
export const CHEAP_DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal'];

/** Human-readable names shown on seats: "Bot · Normal". */
export const DIFFICULTY_LABELS: Readonly<Record<Difficulty, string>> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
  expert: 'Expert',
};

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);
}
