import { describe, expect, it } from 'vitest';
import { decideWinner } from '../src/reducer';
import { DEFAULT_RULESET, makeRuleset } from '../src/ruleset';
import type { Trick } from '../src/state';
import { summarizeTrick, trickModifier } from '../src/tricks';
import { act, c, cards, play, playingState } from './helpers';

function trick(specs: string[], winner: 0 | 1 | 2 | 3 = 0): Trick {
  return {
    leader: 0,
    plays: specs.map((spec, i) => ({ seat: i as 0 | 1 | 2 | 3, cardId: c(spec) })),
    suit: 'red',
    winner,
  };
}

describe('trick value', () => {
  it('is the sum of the Money cards in the trick', () => {
    const summary = summarizeTrick(trick(['R40k', 'R5k', 'R1', 'Y10k']));
    expect(summary.money).toBe(55_000);
    expect(summary.modifier).toBe('none');
    expect(summary.value).toBe(55_000);
  });

  it('is doubled by the Bull', () => {
    const summary = summarizeTrick(trick(['R40k', 'BU', 'R1', 'R2']));
    expect(summary).toMatchObject({ money: 40_000, modifier: 'bull', value: 80_000 });
  });

  it('is cancelled by the Bear', () => {
    const summary = summarizeTrick(trick(['R40k', 'BE', 'R1', 'R2']));
    expect(summary).toMatchObject({ money: 40_000, modifier: 'bear', value: 0 });
  });

  it('is decided by the last-played special when both Bull and Bear appear', () => {
    expect(trickModifier(trick(['R40k', 'BU', 'BE', 'R2']))).toBe('bear');
    expect(summarizeTrick(trick(['R40k', 'BU', 'BE', 'R2'])).value).toBe(0);
    expect(trickModifier(trick(['R40k', 'BE', 'BU', 'R2']))).toBe('bull');
    expect(summarizeTrick(trick(['R40k', 'BE', 'BU', 'R2'])).value).toBe(80_000);
  });
});

describe('hand result', () => {
  /** A one-trick hand: seat 0 leads the $40k of trumps and wins it against three low trumps. */
  function oneTrickHand(bid: number, scores: [number, number] = [0, 0], ruleset = DEFAULT_RULESET) {
    let state = playingState(
      {
        hands: [cards('R40k'), cards('R1'), cards('R2'), cards('R3')],
        trump: 'red',
        leader: 0,
        contract: { bidder: 0, amount: bid },
        discards: cards('Y1', 'Y2', 'Y3'),
      },
      { scores, ruleset },
    );
    for (const [seat, spec] of [
      [0, 'R40k'],
      [1, 'R1'],
      [2, 'R2'],
      [3, 'R3'],
    ] as const) {
      state = play(state, seat, spec);
    }
    return state;
  }

  it('scores the bidding side what it captured when the bid is made', () => {
    const state = oneTrickHand(40_000);
    expect(state.phase).toBe('hand-complete');
    expect(state.hand?.result).toMatchObject({
      bidder: 0,
      bid: 40_000,
      biddingTeam: 0,
      captured: [40_000, 0],
      made: true,
      delta: [40_000, 0],
      scoresAfter: [40_000, 0],
    });
    expect(state.scores).toEqual([40_000, 0]);
    expect(state.handHistory).toHaveLength(1);
  });

  it('sets back the bidding side by the bid when it fails, even into negative scores', () => {
    const state = oneTrickHand(45_000);
    expect(state.hand?.result).toMatchObject({ made: false, delta: [-45_000, 0] });
    expect(state.scores).toEqual([-45_000, 0]);
  });

  it('always scores the opposing side what it captured', () => {
    let state = playingState({
      hands: [cards('R1'), cards('R40k'), cards('R2'), cards('R3')],
      trump: 'red',
      leader: 0,
      contract: { bidder: 0, amount: 175_000 },
      discards: cards('Y1', 'Y2', 'Y3'),
    });
    for (const [seat, spec] of [
      [0, 'R1'],
      [1, 'R40k'],
      [2, 'R2'],
      [3, 'R3'],
    ] as const) {
      state = play(state, seat, spec);
    }
    expect(state.hand?.result).toMatchObject({
      captured: [0, 40_000],
      made: false,
      delta: [-175_000, 40_000],
    });
    expect(state.scores).toEqual([-175_000, 40_000]);
  });

  it('counts Bull-doubled Money towards the contract', () => {
    let state = playingState({
      hands: [cards('R40k'), cards('BU'), cards('R2'), cards('R3')],
      trump: 'red',
      leader: 0,
      contract: { bidder: 0, amount: 80_000 },
      discards: cards('Y1', 'Y2', 'Y3'),
    });
    for (const [seat, spec] of [
      [0, 'R40k'],
      [1, 'BU'],
      [2, 'R2'],
      [3, 'R3'],
    ] as const) {
      state = play(state, seat, spec);
    }
    expect(state.hand?.result).toMatchObject({ captured: [80_000, 0], made: true });
  });

  it('continues to the next hand with the deal passing clockwise', () => {
    const done = oneTrickHand(40_000);
    expect(done.hand?.dealer).toBe(0);
    const next = act(done, 2, { type: 'continue' });
    expect(next.hand?.handNumber).toBe(2);
    expect(next.hand?.dealer).toBe(1);
    expect(next.hand?.phase).toBe('misdeal-window');
    expect(next.scores).toEqual([40_000, 0]);
    expect(next.handHistory).toHaveLength(1);
  });
});

describe('winning the game', () => {
  it('ends the game when a side reaches $1,000,000', () => {
    let state = playingState(
      {
        hands: [cards('R40k'), cards('R1'), cards('R2'), cards('R3')],
        trump: 'red',
        leader: 0,
        contract: { bidder: 0, amount: 40_000 },
        discards: cards('Y1', 'Y2', 'Y3'),
      },
      { scores: [960_000, 500_000] },
    );
    for (const [seat, spec] of [
      [0, 'R40k'],
      [1, 'R1'],
      [2, 'R2'],
      [3, 'R3'],
    ] as const) {
      state = play(state, seat, spec);
    }
    expect(state.phase).toBe('game-over');
    expect(state.winner).toBe(0);
    expect(state.scores).toEqual([1_000_000, 500_000]);
  });

  it('does not end the game when the bidding side is set below the target', () => {
    expect(decideWinner([999_995, 0], 0, DEFAULT_RULESET)).toBeNull();
  });

  it('gives the game to the higher score when both sides reach the target in the same hand', () => {
    expect(decideWinner([1_010_000, 1_005_000], 1, DEFAULT_RULESET)).toBe(0);
    expect(decideWinner([1_005_000, 1_010_000], 0, DEFAULT_RULESET)).toBe(1);
  });

  it('gives an exact tie to the bidding side', () => {
    expect(decideWinner([1_000_000, 1_000_000], 1, DEFAULT_RULESET)).toBe(1);
    expect(decideWinner([1_000_000, 1_000_000], 0, DEFAULT_RULESET)).toBe(0);
  });

  it('can be configured to play on after an exact tie', () => {
    const ruleset = makeRuleset({ tieBreak: 'play-on' });
    expect(decideWinner([1_000_000, 1_000_000], 1, ruleset)).toBeNull();
  });

  it('honours a different target score', () => {
    const ruleset = makeRuleset({ targetScore: 500_000 });
    expect(decideWinner([500_000, 0], 0, ruleset)).toBe(0);
    expect(decideWinner([499_999, 0], 0, ruleset)).toBeNull();
  });

  it('both sides reaching the target in one hand: the higher total wins', () => {
    // Trick 1: seat 0 wins $40k for team 0. Trick 2: seat 3 wins the yellow $40k for team 1.
    let state = playingState(
      {
        hands: [cards('R40k', 'R1'), cards('R2', 'Y40k'), cards('R3', 'Y1'), cards('R4', 'R9')],
        trump: 'red',
        leader: 0,
        contract: { bidder: 0, amount: 40_000 },
        discards: cards('G1', 'G2', 'G3'),
      },
      { scores: [970_000, 965_000] },
    );
    for (const [seat, spec] of [
      [0, 'R40k'],
      [1, 'R2'],
      [2, 'R3'],
      [3, 'R4'],
    ] as const) {
      state = play(state, seat, spec);
    }
    for (const [seat, spec] of [
      [0, 'R1'],
      [1, 'Y40k'],
      [2, 'Y1'],
      [3, 'R9'],
    ] as const) {
      state = play(state, seat, spec);
    }
    expect(state.scores).toEqual([1_010_000, 1_005_000]);
    expect(state.phase).toBe('game-over');
    expect(state.winner).toBe(0);
  });
});
