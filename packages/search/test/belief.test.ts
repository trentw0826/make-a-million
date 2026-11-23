import {
  applyActionOrThrow,
  cardById,
  createGame,
  effectiveSuit,
  type GameState,
  legalMoves,
  observe,
  Rng,
  SEATS,
  type Seat,
} from '@mam/engine';
import { describe, expect, it } from 'vitest';
import { buildBelief, voidsFrom } from '../src/belief/sampler';
import { randomAction } from './helpers';

/** Every decision point of a random hand, with the acting seat. */
function decisionPoints(seed: string): { state: GameState; seat: Seat }[] {
  const rng = Rng.fromSeed(seed);
  let state = createGame({ seed });
  const out: { state: GameState; seat: Seat }[] = [];
  while (state.handHistory.length === 0) {
    const seat = SEATS.find((s) => legalMoves(state, s).kind !== 'none');
    if (seat === undefined) throw new Error('stuck');
    out.push({ state, seat });
    state = applyActionOrThrow(state, seat, randomAction(state, seat, rng)).state;
  }
  return out;
}

describe('buildBelief', () => {
  it('samples arrangements consistent with everything the seat has seen', () => {
    const rng = Rng.fromSeed('belief');
    let checked = 0;
    for (let g = 0; g < 40; g++) {
      for (const { state, seat } of decisionPoints(`belief-${g}`)) {
        for (const observer of SEATS) {
          const obs = observe(state, observer);
          const belief = buildBelief(obs);
          const voids = voidsFrom(obs.tricks, obs.currentTrick, obs.trump);
          for (let k = 0; k < 3; k++) {
            const world = belief.sample(rng);
            checked += 1;
            // Sizes.
            for (const s of SEATS) {
              if (s === observer) continue;
              expect(world.hands[s]?.length).toBe(obs.handSizes[s]);
            }
            // Partition of the unseen cards.
            const all = [...world.hands.flat(), ...world.pile].sort((a, b) => a - b);
            expect(all).toEqual([...belief.unseen].sort((a, b) => a - b));
            // Voids.
            for (const s of SEATS) {
              const v = voids.get(s);
              if (!v || s === observer) continue;
              for (const c of world.hands[s] ?? []) {
                const card = cardById(c);
                if (v.has('all')) expect(['bull', 'bear']).toContain(card.kind);
                const eff = effectiveSuit(card, obs.trump);
                if (eff !== null) expect(v.has(eff)).toBe(false);
              }
            }
            // Discards are number cards.
            if (obs.contract && obs.phase === 'playing' && obs.contract.bidder !== observer) {
              for (const c of world.pile) expect(cardById(c).kind).toBe('suit');
            }
          }
          // The true arrangement is always possible.
          expect(belief.count).toBeGreaterThan(0);
        }
        void seat;
      }
    }
    expect(checked).toBeGreaterThan(10_000);
  }, 60_000);

  it('is uniform over consistent arrangements (chi-square on a small endgame)', () => {
    // Find a late position with few unseen cards from some seat's view.
    for (let g = 0; g < 200; g++) {
      for (const { state } of decisionPoints(`uniform-${g}`)) {
        if (state.hand?.phase !== 'playing') continue;
        const obs = observe(state, 0);
        const belief = buildBelief(obs);
        if (belief.count < 6 || belief.count > 60) continue;
        const rng = Rng.fromSeed('chi');
        const freq = new Map<string, number>();
        const n = 6000;
        for (let i = 0; i < n; i++) {
          const w = belief.sample(rng);
          const key = JSON.stringify(w);
          freq.set(key, (freq.get(key) ?? 0) + 1);
        }
        expect(freq.size).toBe(belief.count);
        // Enumeration lists exactly the arrangements the sampler produces.
        const listed = belief.enumerate(1000);
        expect(listed).not.toBeNull();
        expect(new Set((listed ?? []).map((w) => JSON.stringify(w)))).toEqual(new Set(freq.keys()));
        expect(belief.enumerate(belief.count - 1)).toBeNull();
        const expected = n / belief.count;
        let chi = 0;
        for (const f of freq.values()) chi += (f - expected) ** 2 / expected;
        // Very generous bound: chi-square with k−1 ≤ 59 dof stays far below this.
        expect(chi).toBeLessThan(3 * belief.count + 30);
        return;
      }
    }
    throw new Error('no small endgame found');
  });

  it('pins put cards where they are and condition the rest exactly (diagnostics)', () => {
    const rng = Rng.fromSeed('pins');
    let checked = 0;
    for (let g = 0; g < 60 && checked < 40; g++) {
      for (const { state } of decisionPoints(`pins-${g}`)) {
        const hand = state.hand;
        if (hand?.phase !== 'playing') continue;
        const obs = observe(state, 0);
        // Pin the true holder of every unseen money card and of seat 1's whole hand.
        const pins = new Map<number, Seat | 'pile'>();
        for (const s of [1, 2, 3] as Seat[]) {
          for (const c of hand.hands[s]) {
            if (s === 1 || cardById(c).kind !== 'suit' || [4, 8, 10, 11, 12].includes(c % 13)) {
              pins.set(c, s);
            }
          }
        }
        const belief = buildBelief(obs, pins);
        for (let k = 0; k < 4; k++) {
          const w = belief.sample(rng);
          for (const [c, s] of pins) expect(w.hands[s as Seat]).toContain(c);
        }
        const all = buildBelief(obs).enumerate(400);
        if (all) {
          const keep = all.filter((w) =>
            [...pins].every(([c, s]) => (w.hands[s as Seat] ?? []).includes(c)),
          );
          const pinned = belief.enumerate(400) ?? [];
          expect(new Set(pinned.map((w) => JSON.stringify(w)))).toEqual(
            new Set(keep.map((w) => JSON.stringify(w))),
          );
        }
        checked += 1;
        if (checked >= 40) break;
      }
    }
    expect(checked).toBe(40);
  });
});
