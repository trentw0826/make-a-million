import { createBot } from '@mam/bots';
import { describe, expect, it } from 'vitest';
import { playGame } from '../src/runner';
import { runTournament } from '../src/tournament';

describe('playGame', () => {
  it('runs a game of bots to completion and records it', async () => {
    const outcome = await playGame({
      seed: 'sim-1',
      strategies: [createBot('normal'), createBot('easy'), createBot('normal'), createBot('easy')],
      checkInvariants: true,
    });
    expect(outcome.state.phase).toBe('game-over');
    expect(outcome.recorder.toRecord().actions).toHaveLength(outcome.steps);
  });
});

describe('runTournament', () => {
  it('alternates sides and tallies wins', async () => {
    const result = await runTournament({
      a: () => createBot('normal'),
      b: () => createBot('easy'),
      games: 6,
      seed: 't',
    });
    expect(result.games).toBe(6);
    expect(result.winsA + result.winsB).toBe(6);
    expect(result.summaries.map((s) => s.teamA)).toEqual([0, 1, 0, 1, 0, 1]);
    expect(result.summaries.every((s) => s.hands >= 1)).toBe(true);
  }, 60_000);
});
