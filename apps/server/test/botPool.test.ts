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
import { analyzeInline, BotPool, decideInline } from '../src/botPool';
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
    // Dealer 0: seat 1 opens the auction.
    const obs = observe(createGame({ seed: 'inline', dealer: 0 }), 1);
    const action = await pool.decide('normal', obs, 1);
    expect(['bid', 'callMisdeal']).toContain(action?.type);
    await pool.close();
  });

  it('gives the same analysis on a worker thread as inline', async () => {
    const state = latePosition();
    const obs = observe(state, state.hand?.turn ?? 0);
    const pool = new BotPool(1, silentLogger);
    try {
      const [threaded, inline] = await Promise.all([pool.analyze(obs, 7), analyzeInline(obs, 7)]);
      expect(threaded).toEqual(inline);
      expect(threaded.decision?.kind).toBe('play');
    } finally {
      await pool.close();
    }
  }, 60_000);

  it('puts a bot decision ahead of analysis waiting for a worker', async () => {
    const state = latePosition();
    const seat = state.hand?.turn ?? 0;
    const obs = observe(state, seat);
    const pool = new BotPool(1, silentLogger);
    const done: string[] = [];
    try {
      // The first job takes the only worker; the rest queue, and the bot jumps the analyses.
      await Promise.all([
        pool.analyze(obs, 1).then(() => done.push('a1')),
        pool.analyze(obs, 2).then(() => done.push('a2')),
        pool.analyze(obs, 3).then(() => done.push('a3')),
        pool.decide('hard', obs, 4).then(() => done.push('bot')),
      ]);
      expect(done).toEqual(['a1', 'bot', 'a2', 'a3']);
    } finally {
      await pool.close();
    }
  }, 60_000);
});
