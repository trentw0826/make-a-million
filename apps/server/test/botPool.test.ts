import { HeuristicBot } from '@mam/bots';
import {
  applyActionOrThrow,
  createGame,
  type GameState,
  legalMoves,
  observe,
  Rng,
  SEATS,
} from '@mam/engine';
import { describe, expect, it } from 'vitest';
import { BotPool, decideInline } from '../src/botPool';
import { silentLogger } from '../src/log';

/** A position late in a hand, where a Hard decision is quick. */
function latePosition(): GameState {
  const normal = new HeuristicBot();
  const rng = Rng.fromSeed('pool');
  let state = createGame({ seed: 'pool' });
  for (;;) {
    const seat = SEATS.find((s) => legalMoves(state, s).kind !== 'none');
    if (seat === undefined) throw new Error('stuck');
    const hand = state.hand;
    if (hand?.phase === 'playing' && hand.hands[seat].length <= 4) return state;
    state = applyActionOrThrow(state, seat, normal.decide(observe(state, seat), rng)).state;
  }
}

describe('BotPool', () => {
  it('gives the same decision on a worker thread as inline', async () => {
    const state = latePosition();
    const seat = state.hand?.turn ?? 0;
    const obs = observe(state, seat);
    const pool = new BotPool(1, silentLogger);
    try {
      const [threaded, inline] = await Promise.all([
        pool.decide('hard', obs, 12345),
        decideInline('hard', obs, 12345),
      ]);
      expect(threaded).toEqual(inline);
      expect(legalMoves(state, seat).kind).toBe('play');
    } finally {
      await pool.close();
    }
  }, 60_000);

  it('runs cheap bots inline', async () => {
    const pool = new BotPool(0, silentLogger);
    const obs = observe(createGame({ seed: 'inline' }), 0);
    expect(await pool.decide('normal', obs, 1)).toEqual({ type: 'declineMisdeal' });
    await pool.close();
  });
});
