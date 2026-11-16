import { CHEAP_DIFFICULTIES, createBot } from '@mam/bots';
import { makeRuleset } from '@mam/engine';
import { describe, expect, it } from 'vitest';
import { playGame } from '../src/runner';

describe.each(CHEAP_DIFFICULTIES)('%s bot', (difficulty) => {
  const four = () =>
    [
      createBot(difficulty),
      createBot(difficulty),
      createBot(difficulty),
      createBot(difficulty),
    ] as const;

  it('plays many games without a single illegal action', async () => {
    for (let i = 0; i < 20; i++) {
      const outcome = await playGame({
        seed: `${difficulty}-legal-${i}`,
        strategies: four(),
        checkInvariants: true,
      });
      expect(outcome.state.phase).toBe('game-over');
    }
  }, 60_000);

  it('copes with house-rule variants', async () => {
    const variants = [
      makeRuleset({ bidding: { raiseIncrement: 5_000, openerMustBid: false } }),
      makeRuleset({ misdeal: { enabled: false }, targetScore: 400_000 }),
    ];
    for (const [v, ruleset] of variants.entries()) {
      const outcome = await playGame({
        seed: `${difficulty}-variant-${v}`,
        strategies: four(),
        ruleset,
        checkInvariants: true,
      });
      expect(outcome.state.phase).toBe('game-over');
    }
  }, 60_000);

  it('is deterministic: the same seed produces the same game', async () => {
    const make = () =>
      playGame({
        seed: `${difficulty}-determinism`,
        strategies: [
          createBot(difficulty),
          createBot('normal'),
          createBot(difficulty),
          createBot('easy'),
        ],
      });
    const [a, b] = await Promise.all([make(), make()]);
    expect(a.state).toEqual(b.state);
    expect(a.recorder.toRecord()).toEqual(b.recorder.toRecord());
  });
});
