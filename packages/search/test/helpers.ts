import {
  type Action,
  applyActionOrThrow,
  cardById,
  createGame,
  type GameState,
  isMoney,
  isNumberCard,
  legalMoves,
  Rng,
  SEATS,
  type Seat,
} from '@mam/engine';
import type { LeafUtility } from '../src/play/solver';
import type { PlayState } from '../src/play/state';

/** A simple legal policy: never call a misdeal, open at the minimum, random play. */
export function randomAction(state: GameState, seat: Seat, rng: Rng): Action {
  const legal = legalMoves(state, seat);
  const hand = state.hand?.hands[seat] ?? [];
  switch (legal.kind) {
    case 'bid':
      if (!legal.canPass) return { type: 'bid', amount: legal.minBid };
      return rng.next() < 0.3 ? { type: 'bid', amount: legal.minBid } : { type: 'pass' };
    case 'discard': {
      const numbers = rng.shuffle(hand.filter((id) => isNumberCard(cardById(id))));
      const money = rng.shuffle(hand.filter((id) => isMoney(cardById(id))));
      return { type: 'discard', cardIds: [...numbers, ...money].slice(0, 3) };
    }
    case 'trump':
      return { type: 'nameTrump', suit: rng.pick(legal.suits) };
    case 'play':
      return { type: 'playCard', cardId: rng.pick(legal.cardIds) };
    case 'continue':
      return { type: 'continue' };
    case 'none':
      throw new Error('no move');
  }
}

/** Every playing-phase state of one random hand. */
export function randomPlayStates(seed: string): GameState[] {
  const rng = Rng.fromSeed(seed);
  let state = createGame({ seed });
  const out: GameState[] = [];
  while (state.handHistory.length === 0) {
    const seat = SEATS.find((s) => legalMoves(state, s).kind !== 'none');
    if (seat === undefined) throw new Error('stuck');
    if (state.hand?.phase === 'playing') out.push(state);
    state = applyActionOrThrow(state, seat, randomAction(state, seat, rng)).state;
  }
  return out;
}

/** Plain minimax with no pruning, cache or move merging: the reference for the solver. */
export function bruteForce(s: PlayState, mode: 'linear' | 'utility', u: LeafUtility): number {
  if (s.done) return mode === 'linear' ? 0 : u(s.cap0, s.cap1);
  const buf = new Int32Array(16);
  const n = s.legalMoves(buf);
  const moves = Array.from(buf.subarray(0, n));
  const max = (s.turn & 1) === 0;
  let best = max ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (const m of moves) {
    const before = s.cap0 - s.cap1;
    s.play(m);
    const delta = mode === 'linear' ? s.cap0 - s.cap1 - before : 0;
    const v = delta + bruteForce(s, mode, u);
    s.undo();
    best = max ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}
