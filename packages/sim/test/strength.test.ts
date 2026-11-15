import { createBot } from '@mam/bots';
import { describe, expect, it } from 'vitest';
import { runTournament } from '../src/tournament';

describe('difficulty ordering', () => {
  it('normal beats easy by a clear margin', async () => {
    const result = await runTournament({
      a: () => createBot('normal'),
      b: () => createBot('easy'),
      games: 60,
      seed: 'strength',
    });
    expect(result.winRateA).toBeGreaterThanOrEqual(0.65);
  }, 120_000);

  it('easy against itself is roughly even (no positional bias in the tournament)', async () => {
    const result = await runTournament({
      a: () => createBot('easy'),
      b: () => createBot('easy'),
      games: 60,
      seed: 'fairness',
    });
    expect(result.winRateA).toBeGreaterThan(0.25);
    expect(result.winRateA).toBeLessThan(0.75);
  }, 120_000);
});
