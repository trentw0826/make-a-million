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
import { HARD_DEFAULTS, HardBot, pimcValues } from '../src/hard/index';
import { HeuristicBot } from '../src/heuristic/index';

/** A game driven by the heuristic bot up to the first card of the hand. */
function openingLead(seed: string): GameState {
  let state = createGame({ seed });
  const normal = new HeuristicBot();
  const rng = Rng.fromSeed(seed);
  while (state.hand?.phase !== 'playing') {
    const seat = SEATS.find((s) => legalMoves(state, s).kind !== 'none');
    if (seat === undefined) throw new Error('stuck');
    state = applyActionOrThrow(state, seat, normal.decide(observe(state, seat), rng)).state;
  }
  return state;
}

function leaderObs(state: GameState) {
  const seat = state.hand?.turn;
  if (seat === null || seat === undefined) throw new Error('no turn');
  return observe(state, seat);
}

describe('decision deadline (live-play safety net)', () => {
  it('PIMC past its deadline still values every legal card, from one shallow world', () => {
    const obs = leaderObs(openingLead('deadline-pimc'));
    const r = pimcValues(obs, Rng.fromSeed('d'), HARD_DEFAULTS, { deadline: Date.now() - 1 });
    expect(r.timedOut).toBe(true);
    expect(r.worlds).toBe(1);
    const legal = obs.legal.kind === 'play' ? obs.legal.cardIds : [];
    expect([...r.moves].sort()).toEqual([...legal].sort());
    expect(r.means.every(Number.isFinite)).toBe(true);
  });

  it('without a deadline nothing changes', () => {
    const obs = leaderObs(openingLead('deadline-same'));
    const opts = { ...HARD_DEFAULTS, worlds: 6 };
    const a = pimcValues(obs, Rng.fromSeed('d'), opts);
    const b = pimcValues(obs, Rng.fromSeed('d'), opts, { deadline: Number.POSITIVE_INFINITY });
    expect(a.timedOut).toBe(false);
    expect(b).toEqual(a);
  });

  it('Hard answers every kind of decision quickly and legally once time is up', () => {
    const hard = new HardBot(HARD_DEFAULTS);
    const rng = Rng.fromSeed('deadline-game');
    let state = createGame({ seed: 'deadline-game' });
    let slowest = 0;
    const kinds = new Set<string>();
    for (let step = 0; step < 400 && state.phase !== 'game-over'; step++) {
      if (state.hand?.phase === 'hand-complete') break;
      const seat = SEATS.find((s) => legalMoves(state, s).kind !== 'none');
      if (seat === undefined) break;
      const obs = observe(state, seat);
      kinds.add(obs.legal.kind);
      const t0 = performance.now();
      const action = hard.decide(obs, rng, { deadline: Date.now() - 1 });
      slowest = Math.max(slowest, performance.now() - t0);
      state = applyActionOrThrow(state, seat, action).state;
    }
    expect(kinds).toContain('play');
    expect(kinds).toContain('bid');
    // Generous for slow CI machines; uncut opening leads take seconds.
    expect(slowest).toBeLessThan(400);
  });
});
