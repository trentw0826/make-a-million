import { expect } from 'vitest';
import type { Action } from '../src/actions';
import {
  BEAR_ID,
  BULL_ID,
  type CardId,
  cardById,
  DECK_SIZE,
  isMoney,
  isNumberCard,
  RANKS,
  type Rank,
  SUITS,
  type Suit,
  sortHand,
  sumMoney,
  TIGER_ID,
  TOTAL_MONEY,
} from '../src/cards';
import type { GameEvent } from '../src/events';
import { type LegalMoves, legalMoves } from '../src/legal';
import { applyActionOrThrow, createGame } from '../src/reducer';
import { Recorder } from '../src/replay';
import { Rng } from '../src/rng';
import { DEFAULT_RULESET, type Ruleset } from '../src/ruleset';
import { SEATS, type Seat } from '../src/seats';
import type { Contract, GameState, HandState } from '../src/state';

// ---------------------------------------------------------------------------
// Card notation: "R40k", "Y11", "B1", "G5k", "T" (Tiger), "BU" (Bull), "BE" (Bear).

const SUIT_LETTER: Record<string, Suit> = { R: 'red', Y: 'yellow', B: 'black', G: 'green' };

export function cardId(suit: Suit, rank: Rank): CardId {
  return SUITS.indexOf(suit) * RANKS.length + RANKS.indexOf(rank);
}

export function c(spec: string): CardId {
  if (spec === 'T') return TIGER_ID;
  if (spec === 'BU') return BULL_ID;
  if (spec === 'BE') return BEAR_ID;
  const suit = SUIT_LETTER[spec[0] as string];
  const rank = spec.slice(1) as Rank;
  if (!suit || !RANKS.includes(rank)) throw new Error(`bad card spec ${spec}`);
  return cardId(suit, rank);
}

export function cards(...specs: string[]): CardId[] {
  return specs.map(c);
}

// ---------------------------------------------------------------------------
// State construction for scenario tests.

type Hands = [CardId[], CardId[], CardId[], CardId[]];

interface HandOverrides {
  readonly hands: Hands;
  readonly dealer?: Seat;
  readonly phase?: HandState['phase'];
  readonly trump?: Suit | null;
  readonly contract?: Contract | null;
  readonly leader?: Seat;
  readonly widow?: CardId[];
  readonly discards?: CardId[];
  readonly handNumber?: number;
}

interface GameOverrides {
  readonly scores?: [number, number];
  readonly ruleset?: Ruleset;
  readonly handHistory?: GameState['handHistory'];
}

/** A game in the 'playing' phase with the given hands, trump and leader. */
export function playingState(hand: HandOverrides, game: GameOverrides = {}): GameState {
  const dealer = hand.dealer ?? 0;
  const contract =
    hand.contract === undefined ? { bidder: hand.leader ?? 1, amount: 175_000 } : hand.contract;
  const leader = hand.leader ?? contract?.bidder ?? 1;
  const phase = hand.phase ?? 'playing';
  const handState: HandState = {
    handNumber: hand.handNumber ?? 1,
    dealer,
    redeals: 0,
    phase,
    hands: hand.hands.map(sortHand) as unknown as HandState['hands'],
    widow: hand.widow ?? [],
    discards: hand.discards ?? [],
    misdeal: { pending: [], eligible: [] },
    auction: {
      entries: contract ? [{ seat: contract.bidder, kind: 'bid', amount: contract.amount }] : [],
      passed: [],
      turn: leader,
      highBid: contract,
    },
    contract,
    trump: hand.trump === undefined ? 'red' : hand.trump,
    tricks: [],
    currentTrick: phase === 'playing' ? { leader, plays: [], suit: null, winner: null } : null,
    turn:
      phase === 'playing'
        ? leader
        : phase === 'discarding' || phase === 'naming-trump'
          ? (contract?.bidder ?? null)
          : null,
    result: null,
  };
  return {
    ruleset: game.ruleset ?? DEFAULT_RULESET,
    seed: 'scenario',
    rngState: [1, 2, 3, 4],
    phase: phase === 'hand-complete' ? 'hand-complete' : phase,
    scores: game.scores ?? [0, 0],
    dealer,
    handHistory: game.handHistory ?? [],
    hand: handState,
    winner: null,
  };
}

/** A game where the bidder holds 16 cards and must discard. */
export function discardingState(bidder: Seat, bidderHand: CardId[], others?: Hands): GameState {
  const hands: Hands = others ?? [[], [], [], []];
  hands[bidder] = bidderHand;
  return playingState({
    hands,
    phase: 'discarding',
    trump: null,
    contract: { bidder, amount: 175_000 },
    leader: bidder,
  });
}

// ---------------------------------------------------------------------------
// Driving games.

export function act(state: GameState, seat: Seat, action: Action): GameState {
  return applyActionOrThrow(state, seat, action).state;
}

export function play(state: GameState, seat: Seat, spec: string): GameState {
  return act(state, seat, { type: 'playCard', cardId: c(spec) });
}

/** Every seat confirms it is ready to bid. */
export function readyAll(state: GameState): GameState {
  let s = state;
  while (s.hand && s.hand.phase === 'misdeal-window') {
    const seat = s.hand.misdeal.pending[0];
    if (seat === undefined) break;
    s = act(s, seat, { type: 'declineMisdeal' });
  }
  return s;
}

/** Seats that have something to do right now. */
export function actingSeats(state: GameState): Seat[] {
  return SEATS.filter((seat) => legalMoves(state, seat).kind !== 'none');
}

/** A legal action chosen at random; null when the seat has nothing to do. */
export function randomAction(legal: LegalMoves, hand: readonly CardId[], rng: Rng): Action | null {
  switch (legal.kind) {
    case 'none':
      return null;
    case 'misdeal':
      return legal.canCall && rng.next() < 0.5
        ? { type: 'callMisdeal' }
        : { type: 'declineMisdeal' };
    case 'bid': {
      if (!legal.canPass) return { type: 'bid', amount: legal.minBid };
      if (legal.minBid <= 260_000 && rng.next() < 0.45) {
        return { type: 'bid', amount: legal.minBid + legal.step * rng.int(3) };
      }
      return { type: 'pass' };
    }
    case 'discard': {
      const numbers = rng.shuffle(hand.filter((id) => isNumberCard(cardById(id))));
      const money = rng.shuffle(hand.filter((id) => isMoney(cardById(id))));
      const chosen = [...numbers.slice(0, legal.requiredNumberCards)];
      while (chosen.length < 3) chosen.push(money.shift() as CardId);
      return { type: 'discard', cardIds: chosen };
    }
    case 'trump':
      return { type: 'nameTrump', suit: rng.pick(legal.suits) };
    case 'play':
      return { type: 'playCard', cardId: rng.pick(legal.cardIds) };
    case 'continue':
      return { type: 'continue' };
  }
}

export interface RandomGame {
  readonly state: GameState;
  readonly states: readonly GameState[];
  readonly events: readonly GameEvent[];
  readonly recorder: Recorder;
  readonly steps: number;
}

/** Plays a whole game with random legal actions, checking invariants after every step. */
export function playRandomGame(
  seed: string | number,
  ruleset: Ruleset = DEFAULT_RULESET,
  options: { maxSteps?: number; keepStates?: boolean } = {},
): RandomGame {
  const maxSteps = options.maxSteps ?? 50_000;
  const rng = Rng.fromSeed(`policy:${seed}`);
  let state = createGame({ seed, ruleset });
  const recorder = new Recorder(state);
  const states: GameState[] = options.keepStates ? [state] : [];
  const events: GameEvent[] = [];
  let steps = 0;
  checkInvariants(state);
  while (state.phase !== 'game-over') {
    if (steps++ > maxSteps) throw new Error(`game did not finish within ${maxSteps} steps`);
    const seat = actingSeats(state)[0];
    if (seat === undefined) throw new Error(`no seat can act in phase ${state.hand?.phase}`);
    const action = randomAction(legalMoves(state, seat), state.hand?.hands[seat] ?? [], rng);
    if (!action) throw new Error('acting seat produced no action');
    recorder.record(seat, action);
    const result = applyActionOrThrow(state, seat, action);
    state = result.state;
    events.push(...result.events);
    if (options.keepStates) states.push(state);
    checkInvariants(state);
  }
  return { state, states, events, recorder, steps };
}

// ---------------------------------------------------------------------------
// Invariants that must hold in every reachable state.

export function allCardsInPlay(state: GameState): CardId[] {
  const hand = state.hand;
  if (!hand) return [];
  const widowStillAside = hand.phase === 'misdeal-window' || hand.phase === 'bidding';
  return [
    ...hand.hands.flat(),
    ...(widowStillAside ? hand.widow : []),
    ...hand.discards,
    ...(hand.currentTrick?.plays.map((p) => p.cardId) ?? []),
    ...hand.tricks.flatMap((t) => t.plays.map((p) => p.cardId)),
  ];
}

export function checkInvariants(state: GameState): void {
  const hand = state.hand;
  if (!hand) return;

  const all = allCardsInPlay(state);
  expect(all.length, 'every card is somewhere exactly once').toBe(DECK_SIZE);
  expect(new Set(all).size, 'no card is duplicated').toBe(DECK_SIZE);
  expect(sumMoney(all), 'money is conserved').toBe(TOTAL_MONEY);

  for (const seat of SEATS) {
    const own = hand.hands[seat];
    expect(own, 'hands are kept sorted').toEqual(sortHand(own));
  }

  if (hand.phase === 'playing') {
    expect(hand.trump, 'trump is named before play').not.toBeNull();
    expect(hand.contract, 'a contract exists before play').not.toBeNull();
    expect(hand.currentTrick, 'a trick is always in progress').not.toBeNull();
    expect(hand.discards.length, 'exactly three discards').toBe(3);
    expect(hand.turn, 'someone has the turn').not.toBeNull();
  }

  if (hand.result) {
    const faceMoney = hand.result.tricks.reduce((sum, t) => sum + t.money, 0);
    expect(faceMoney, 'money in tricks = deck money − discarded money').toBe(
      TOTAL_MONEY - sumMoney(hand.discards),
    );
  }

  let expected: [number, number] = [0, 0];
  for (const r of state.handHistory) {
    expected = [expected[0] + r.delta[0], expected[1] + r.delta[1]];
    expect(r.scoresAfter).toEqual(expected);
  }
  expect(state.scores, 'scores equal the sum of hand deltas').toEqual(expected);
}
