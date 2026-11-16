import {
  type CardId,
  type GameState,
  type Observation,
  type Seat,
  SUITS,
  type Suit,
  summarizeTrick,
  type Trick,
} from '@mam/engine';
import { PlayState } from './state';

/** Builds a play state from four known hands plus the public play so far. */
export function buildPlayState(input: {
  readonly hands: readonly (readonly CardId[])[];
  readonly trump: Suit;
  readonly tricks: readonly Trick[];
  readonly currentTrick: Trick | null;
  readonly turn: Seat;
}): PlayState {
  const s = new PlayState();
  s.trump = SUITS.indexOf(input.trump);
  for (let seat = 0; seat < 4; seat++) {
    for (const card of input.hands[seat] ?? []) s.add(seat, card);
  }
  for (const t of input.tricks) {
    const summary = summarizeTrick(t);
    const k = summary.value / 1000;
    if (summary.winner % 2 === 0) s.cap0 += k;
    else s.cap1 += k;
  }
  const trick = input.currentTrick;
  s.leader = trick?.leader ?? input.turn;
  s.trickCount = 0;
  s.trickSuit = trick?.suit ? SUITS.indexOf(trick.suit) : -1;
  for (const p of trick?.plays ?? []) {
    s.trickCards[s.trickCount] = p.cardId;
    s.trickSeats[s.trickCount] = p.seat;
    s.trickCount += 1;
  }
  s.turn = input.turn;
  return s;
}

/** The true position (all hands visible). For the simulator's oracle and for tests only. */
export function playStateFromGame(state: GameState): PlayState {
  const hand = state.hand;
  if (hand?.phase !== 'playing' || hand.trump === null || hand.turn === null) {
    throw new Error('playStateFromGame needs a game in the playing phase');
  }
  return buildPlayState({
    hands: hand.hands,
    trump: hand.trump,
    tricks: hand.tricks,
    currentTrick: hand.currentTrick,
    turn: hand.turn,
  });
}

/**
 * One possible world for an observer: its own hand from the observation, the other hands
 * from a sampled assignment of the unseen cards.
 */
export function playStateFromWorld(
  obs: Observation,
  others: readonly (readonly CardId[])[],
): PlayState {
  if (obs.trump === null || obs.turn === null) {
    throw new Error('playStateFromWorld needs the playing phase');
  }
  const hands = [0, 1, 2, 3].map((seat) => (seat === obs.seat ? obs.hand : (others[seat] ?? [])));
  return buildPlayState({
    hands,
    trump: obs.trump,
    tricks: obs.tricks,
    currentTrick: obs.currentTrick,
    turn: obs.turn,
  });
}
