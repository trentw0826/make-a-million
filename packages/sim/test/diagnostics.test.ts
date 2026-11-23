import { HeuristicBot } from '@mam/bots';
import {
  applyAction,
  applyActionOrThrow,
  cardById,
  createGame,
  type GameState,
  legalMoves,
  nextSeat,
  observe,
  partnerOf,
  Rng,
  SEATS,
  type Seat,
} from '@mam/engine';
import { buildBelief } from '@mam/search';
import { describe, expect, it } from 'vitest';
import { peekPins } from '../src/oracle';
import '../src/registry';
import { makeStrategy } from '../src/strategies';

/** A Normal-driven hand, stopped after `plays` cards of the play phase. */
function midHand(seed: string, plays: number): GameState {
  let state = createGame({ seed });
  const normal = new HeuristicBot();
  const rng = Rng.fromSeed(seed);
  let played = 0;
  while (!(state.hand?.phase === 'playing' && played >= plays)) {
    const seat = SEATS.find((s) => legalMoves(state, s).kind !== 'none');
    if (seat === undefined) throw new Error('stuck');
    if (state.hand?.phase === 'playing') played += 1;
    state = applyActionOrThrow(state, seat, normal.decide(observe(state, seat), rng)).state;
  }
  return state;
}

const SMALL = 'worlds=4,nodes=150000,worldNodes=60000,bidWorlds=16,screenWorlds=6,refineWorlds=2';

describe('peek pins', () => {
  it('reveal exactly the named cards and seats, where they really are', () => {
    const state = midHand('peek-pins', 9);
    const hand = state.hand;
    if (!hand) throw new Error('no hand');
    const seat = state.hand?.turn as Seat;
    const bidder = hand.contract?.bidder;
    const partner = peekPins(state, seat, ['partner']);
    expect([...partner.keys()].sort()).toEqual([...hand.hands[partnerOf(seat)]].sort());
    const lho = peekPins(state, seat, ['lho']);
    expect([...lho.values()].every((s) => s === nextSeat(seat))).toBe(true);
    const money = peekPins(state, seat, ['money']);
    for (const [c, s] of money) {
      expect(cardById(c).kind).toBe('suit');
      expect([4, 8, 10, 11, 12]).toContain(c % 13);
      expect(s === 'pile' ? hand.discards : hand.hands[s]).toContain(c);
    }
    const all = peekPins(state, seat, ['all']);
    let unseen = 0;
    for (const s of SEATS) if (s !== seat) unseen += hand.hands[s].length;
    expect(all.size).toBe(unseen + (bidder === seat ? 0 : 3));
    // Every card pinned leaves exactly one world: the true one.
    expect(buildBelief(observe(state, seat), all).count).toBe(1);
  });

  it('a peek spec plays legal cards on any base', async () => {
    const state = midHand('peek-bot', 5);
    const seat = state.hand?.turn as Seat;
    for (const spec of [
      `peek:cards=money+partner,${SMALL}`,
      `peek:cards=all,base=expert0,${SMALL}`,
    ]) {
      const bot = makeStrategy(spec);
      if (!('decideWithState' in bot)) throw new Error('peek must be an oracle strategy');
      const action = await bot.decideWithState(
        state,
        seat,
        observe(state, seat),
        Rng.fromSeed('p'),
      );
      expect(applyAction(state, seat, action).ok).toBe(true);
    }
    expect(() => makeStrategy('peek:cards=nonsense')).toThrow(/unknown peek group/);
    expect(() => makeStrategy('hybrid:base=nope')).toThrow(/unknown base/);
  });
});

describe('hindsight contract decisions', () => {
  it('never does worse than its base on the decision it takes over', async () => {
    const { playGame } = await import('../src/runner');
    const { equityAfter } = await import('../src/duplicate');
    const { ME_TABLE } = await import('@mam/search');
    let differed = 0;
    for (let i = 0; i < 6; i++) {
      const play = (spec: string) =>
        playGame({
          seed: `hindsight-${i}`,
          dealer: (i % 4) as Seat,
          hands: 1,
          strategies: [
            makeStrategy(spec),
            makeStrategy(`hard:${SMALL}`),
            makeStrategy(spec),
            makeStrategy(`hard:${SMALL}`),
          ],
        });
      const base = await play(`hard:${SMALL}`);
      const oracle = await play(`hindsight:kinds=trump,${SMALL}`);
      const rb = base.state.handHistory[0];
      const ro = oracle.state.handHistory[0];
      if (!rb || !ro) throw new Error('no hand');
      const eb = equityAfter(rb, 0, ME_TABLE);
      const eo = equityAfter(ro, 0, ME_TABLE);
      expect(eo).toBeGreaterThanOrEqual(eb - 1e-12);
      if (eo > eb) differed += 1;
    }
    // Deterministic: on these deals hindsight finds a better trump at least once.
    expect(differed).toBeGreaterThan(0);
    expect(() => makeStrategy('hindsight:kinds=play')).toThrow(/unknown hindsight kind/);
  }, 300_000);
});
