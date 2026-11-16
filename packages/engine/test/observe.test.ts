import { describe, expect, it } from 'vitest';
import { observe, tableView } from '../src/observe';
import { createGame } from '../src/reducer';
import { Rng } from '../src/rng';
import { SEATS, type Seat } from '../src/seats';
import type { GameState } from '../src/state';
import { act, playRandomGame, readyAll } from './helpers';

/**
 * Redistribute every card the observer cannot see (other hands, and the widow unless the
 * observer is the bidder) at random, keeping hand sizes. A leak-free observation must not
 * change.
 */
function permuteHidden(state: GameState, seat: Seat, rng: Rng): GameState {
  const hand = state.hand;
  if (!hand) return state;
  const isBidder = hand.contract?.bidder === seat;
  const widowAside = hand.phase === 'misdeal-window' || hand.phase === 'bidding';
  const others = SEATS.filter((s) => s !== seat);

  const pool: number[] = others.flatMap((s) => [...hand.hands[s]]);
  const includeWidow = widowAside && !isBidder;
  if (includeWidow) pool.push(...hand.widow);
  rng.shuffle(pool);

  const hands = hand.hands.map((h) => [...h]) as [number[], number[], number[], number[]];
  let cursor = 0;
  for (const s of others) {
    const size = hands[s].length;
    hands[s] = pool.slice(cursor, cursor + size).sort((a, b) => a - b);
    cursor += size;
  }
  const widow = includeWidow ? pool.slice(cursor) : [...hand.widow];

  return { ...state, hand: { ...hand, hands, widow } };
}

describe('observe', () => {
  it('never changes when hidden cards are rearranged', () => {
    const rng = Rng.fromSeed('permute');
    for (const seed of ['leak-1', 'leak-2', 'leak-3']) {
      const { states } = playRandomGame(seed, undefined, { keepStates: true });
      for (const state of states) {
        for (const seat of SEATS) {
          const before = observe(state, seat);
          const after = observe(permuteHidden(state, seat, rng), seat);
          expect(after).toEqual(before);
        }
      }
    }
  });

  it('shows the widow and discards to the bidder only', () => {
    let state = readyAll(createGame({ seed: 'widow-view' }));
    for (const seat of SEATS) expect(observe(state, seat).widow).toBeNull();
    state = act(state, 1, { type: 'bid', amount: 175_000 });
    for (const seat of [2, 3, 0] as const) state = act(state, seat, { type: 'pass' });
    expect(observe(state, 1).widow).toEqual(state.hand?.widow);
    expect(observe(state, 1).discards).toEqual([]);
    for (const seat of [0, 2, 3] as const) {
      expect(observe(state, seat).widow).toBeNull();
      expect(observe(state, seat).discards).toBeNull();
    }
  });

  it("shows only the observer's own hand", () => {
    const state = createGame({ seed: 'own-hand' });
    for (const seat of SEATS) {
      const obs = observe(state, seat);
      expect(obs.hand).toEqual(state.hand?.hands[seat]);
      expect(obs.handSizes).toEqual([13, 13, 13, 13]);
      expect(Object.keys(obs)).not.toContain('hands');
    }
  });

  it('reveals misdeal eligibility only to the seat itself', () => {
    const state = createGame({ seed: 'eligibility' });
    for (const seat of SEATS) {
      const obs = observe(state, seat);
      expect(obs.misdeal.canCall).toBe(state.hand?.misdeal.eligible.includes(seat));
      expect(Object.keys(obs.misdeal)).toEqual(['pending', 'canCall']);
    }
  });

  it("includes the seat's legal moves", () => {
    const state = readyAll(createGame({ seed: 'legal' }));
    expect(observe(state, 1).legal.kind).toBe('bid');
    expect(observe(state, 0).legal.kind).toBe('none');
  });
});

describe('tableView', () => {
  it('removes completed tricks and keeps only their counts', () => {
    const { states } = playRandomGame('table-1', undefined, { keepStates: true });
    for (const state of states) {
      for (const seat of SEATS) {
        const obs = observe(state, seat);
        const view = tableView(obs);
        expect(Object.keys(view)).not.toContain('tricks');
        expect(view.trickCounts[0] + view.trickCounts[1]).toBe(obs.tricks.length);
        expect(view.hand).toEqual(obs.hand);
        expect(view.currentTrick).toEqual(obs.currentTrick);
      }
    }
  });

  it('serialises without hidden information', () => {
    const { states } = playRandomGame('table-2', undefined, { keepStates: true });
    const playing = states.filter((s) => s.hand?.phase === 'playing');
    // Sample across the whole game so later hands (with a score-sheet history) are covered.
    const sample = playing.filter((_, i) => i % Math.max(1, Math.floor(playing.length / 40)) === 0);
    expect(sample.some((s) => s.handHistory.length > 0)).toBe(true);
    for (const state of sample) {
      for (const seat of SEATS) {
        const json = JSON.stringify(tableView(observe(state, seat)));
        expect(json).not.toContain('"hands"');
        expect(json).not.toContain('"eligible"');
        expect(json).not.toContain('"tricks"');
      }
    }
  });

  it('reports the phase of the hand under way, then game over', () => {
    const { states } = playRandomGame('table-3', undefined, { keepStates: true });
    const seen = new Set<string>();
    for (const state of states) {
      const phase = observe(state, 0).phase;
      seen.add(phase);
      expect(phase).toBe(state.phase === 'game-over' ? 'game-over' : state.hand?.phase);
    }
    expect([...seen].sort()).toEqual(
      [
        'bidding',
        'discarding',
        'game-over',
        'hand-complete',
        'misdeal-window',
        'naming-trump',
        'playing',
      ].sort(),
    );
  });
});
