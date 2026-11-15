import {
  applyActionOrThrow,
  BULL_ID,
  createGame,
  type GameState,
  legalMoves,
  observe,
  Rng,
  SEATS,
  type Seat,
  TIGER_ID,
  type Trick,
} from '@mam/engine';
import type { World } from '@mam/search';
import { describe, expect, it } from 'vitest';
import { HeuristicBot } from '../src/heuristic/index';
import {
  couldPlay,
  FINE_CELLS,
  makeSpecialsWeight,
  opportunity,
  playsWithPrefix,
} from '../src/inference/specials';

// Red cards are ids 0–12, yellow 13–25 (suit order of the ids); rank 0 is the lowest.
const trick = (plays: [Seat, number][], suit: Trick['suit']): Trick => ({
  leader: plays[0]?.[0] ?? 0,
  plays: plays.map(([seat, cardId]) => ({ seat, cardId })),
  suit,
  winner: null,
});

describe('specials inference', () => {
  it('knows when the Tiger, Bull or Bear was a legal alternative', () => {
    const empty = trick([], null);
    const redLed = trick([[0, 5]], 'red');
    // The Bull may not be led (except as a last card), but may be played when void.
    expect(couldPlay(BULL_ID, 7, empty, 'yellow')).toBe(false);
    expect(couldPlay(BULL_ID, 6, redLed, 'yellow')).toBe(false);
    expect(couldPlay(BULL_ID, 14, redLed, 'yellow')).toBe(true);
    // The Tiger may be led, follows trump, and is playable when void.
    expect(couldPlay(TIGER_ID, 7, empty, 'yellow')).toBe(true);
    expect(couldPlay(TIGER_ID, 6, redLed, 'yellow')).toBe(false);
    expect(couldPlay(TIGER_ID, 6, redLed, 'red')).toBe(true);
    // Playing the card itself is not a missed chance.
    expect(couldPlay(BULL_ID, BULL_ID, redLed, 'yellow')).toBe(false);
  });

  it('maps every situation to a cell inside the table', () => {
    for (const special of [TIGER_ID, BULL_ID, 54]) {
      for (const hand of [13, 6, 1]) {
        const prefix = trick(
          [
            [1, 12],
            [2, 11],
            [3, 10],
          ],
          'red',
        );
        const { fine } = opportunity(special, prefix, 'yellow', 0, hand);
        expect(fine).toBeGreaterThanOrEqual(0);
        expect(fine).toBeLessThan(FINE_CELLS);
      }
    }
  });

  it('makes a holder who passed up chances to play a special less likely', () => {
    const model = { source: 'test', pPlay: new Array(FINE_CELLS).fill(0.5) };
    let checked = 0;
    for (let g = 0; g < 40 && checked < 5; g++) {
      let state: GameState = createGame({ seed: `specials-${g}` });
      const bot = new HeuristicBot();
      const rng = Rng.fromSeed(`specials-${g}`);
      while (state.hand && state.hand.phase !== 'hand-complete') {
        const seat = SEATS.find((s) => legalMoves(state, s).kind !== 'none');
        if (seat === undefined) break;
        const obs = observe(state, seat);
        const weight = obs.trump && makeSpecialsWeight(obs, { temperature: 1, floor: 0 }, model);
        const trump = obs.trump;
        if (weight && trump && !obs.hand.includes(BULL_ID)) {
          const tricks = [...obs.tricks, ...(obs.currentTrick ? [obs.currentTrick] : [])];
          const bullPlayed = tricks.some((t) => t.plays.some((p) => p.cardId === BULL_ID));
          for (const holder of bullPlayed ? [] : SEATS.filter((s) => s !== seat)) {
            const chances = [...playsWithPrefix(tricks, trump)].filter(
              (p) => p.seat === holder && couldPlay(BULL_ID, p.card, p.prefix, trump),
            ).length;
            // A world in which only the Bull is placed: its holder's missed chances count.
            const world: World = {
              hands: SEATS.map((s) => (s === holder ? [BULL_ID] : [])),
              pile: [],
            };
            expect(weight(world)).toBeCloseTo(0.5 ** chances, 9);
            if (chances > 0) checked += 1;
          }
        }
        state = applyActionOrThrow(state, seat, bot.decide(obs, rng)).state;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
