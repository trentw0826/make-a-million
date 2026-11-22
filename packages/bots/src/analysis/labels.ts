/**
 * How a decision is graded by the money it gave up against the best option, in the manner
 * of a chess engine's move classes. `forced`: there was only one legal choice.
 */
export type MoveLabel = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'forced';

/**
 * Upper bounds ($1000s lost) of each class; anything more is a blunder. The analysis is an
 * estimate over sampled deals, so differences of a thousand or so are noise and count as
 * the best move.
 */
export const LABEL_LIMITS_K = {
  best: 1,
  good: 5,
  inaccuracy: 15,
  mistake: 40,
} as const;

export function labelFor(lossK: number, forced = false): MoveLabel {
  if (forced) return 'forced';
  if (lossK <= LABEL_LIMITS_K.best) return 'best';
  if (lossK < LABEL_LIMITS_K.good) return 'good';
  if (lossK < LABEL_LIMITS_K.inaccuracy) return 'inaccuracy';
  if (lossK < LABEL_LIMITS_K.mistake) return 'mistake';
  return 'blunder';
}
