import { describe, expect, it } from 'vitest';
import '../src/registry';
import { playGame } from '../src/runner';
import { makeStrategy } from '../src/strategies';

/** Small budgets: these tests check legality and determinism, not strength. */
const SMALL =
  'hard:worlds=4,nodes=150000,worldNodes=60000,bidWorlds=16,screenWorlds=6,refineWorlds=2';

describe('hard bot', () => {
  it('plays whole games without an illegal action, with invariants checked', async () => {
    for (let i = 0; i < 2; i++) {
      const outcome = await playGame({
        seed: `hard-legal-${i}`,
        strategies: [
          makeStrategy(SMALL),
          makeStrategy('normal'),
          makeStrategy(SMALL),
          makeStrategy('easy'),
        ],
        checkInvariants: true,
      });
      expect(outcome.state.phase).toBe('game-over');
    }
  }, 300_000);

  it('is deterministic for a given seed', async () => {
    const run = () =>
      playGame({
        seed: 'hard-determinism',
        hands: 1,
        strategies: [
          makeStrategy(SMALL),
          makeStrategy(SMALL),
          makeStrategy(SMALL),
          makeStrategy(SMALL),
        ],
      });
    const [a, b] = [await run(), await run()];
    expect(a.recorder.toRecord()).toEqual(b.recorder.toRecord());
  }, 300_000);

  it('accepts options and rejects unknown ones', () => {
    expect(makeStrategy('hard:playUtility=equity,searchBid=0').id).toBe('hard');
    expect(() => makeStrategy('hard:nonsense=1')).toThrow(/unknown option/);
  });
});
