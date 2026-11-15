import { BEAR, BULL, cardMoneyK, type PlayState, SPEC_BEAR, SPEC_BULL, TIGER } from './state';

/**
 * Plays the rest of the hand with a fast greedy policy for all four seats (all cards visible)
 * and returns the money each team captures from here, then restores the position.
 * Used to estimate positions too early in a hand to solve exactly.
 */
export function greedyPlayout(s: PlayState, out: { d0: number; d1: number }): void {
  const start0 = s.cap0;
  const start1 = s.cap1;
  const buf = new Int32Array(16);
  let plies = 0;
  while (!s.done) {
    const n = s.legalMoves(buf);
    s.play(chooseGreedy(s, buf, n));
    plies += 1;
  }
  out.d0 = s.cap0 - start0;
  out.d1 = s.cap1 - start1;
  for (let i = 0; i < plies; i++) s.undo();
}

function liveTopRank(s: PlayState, suit: number): number {
  const live =
    (s.hand[suit] as number) |
    (s.hand[4 + suit] as number) |
    (s.hand[8 + suit] as number) |
    (s.hand[12 + suit] as number);
  return live === 0 ? -1 : 31 - Math.clz32(live);
}

function chooseGreedy(s: PlayState, moves: Int32Array, n: number): number {
  if (n === 1) return moves[0] as number;
  const seat = s.turn;
  if (s.trickCount === 0) return chooseLead(s, moves, n, seat);

  const winner = s.trickWinner();
  let winStrength = -1;
  for (let i = 0; i < s.trickCount; i++) {
    winStrength = Math.max(winStrength, s.strength(s.trickCards[i] as number));
  }
  const partnerWinning = winner >= 0 && ((winner ^ seat) & 1) === 0;
  const last = s.trickCount === 3;
  const money = s.trickValueK();
  const spec = s.spec[seat] as number;

  if (partnerWinning) {
    if (last && spec & SPEC_BULL && money >= 20 && hasMove(moves, n, BULL)) return BULL;
    // Feed money if partner's card holds; otherwise keep it cheap.
    let best = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      const m = moves[i] as number;
      if (m === BULL || m === BEAR) continue;
      const st = strengthFor(s, m);
      const sc = last ? cardMoneyK(m) * 10 - st / 100 : -st - cardMoneyK(m);
      if (sc > bestScore) {
        bestScore = sc;
        best = m;
      }
    }
    return best >= 0 ? best : (moves[0] as number);
  }

  // Opponent winning (or nobody yet): win cheaply if worthwhile, else throw the cheapest card.
  let cheapestWin = -1;
  let cheapestWinStrength = Number.POSITIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    const m = moves[i] as number;
    const st = strengthFor(s, m);
    if (st > winStrength && st < cheapestWinStrength) {
      cheapestWin = m;
      cheapestWinStrength = st;
    }
  }
  if (cheapestWin >= 0 && (money > 0 || last || cheapestWinStrength < 100)) return cheapestWin;
  if (spec & SPEC_BEAR && money >= 20 && hasMove(moves, n, BEAR)) return BEAR;
  return cheapest(s, moves, n);
}

function chooseLead(s: PlayState, moves: Int32Array, n: number, seat: number): number {
  // Cash a boss card in a side suit (richest first), else draw trumps with a boss trump,
  // else lead the lowest card of the longest suit.
  let best = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    const m = moves[i] as number;
    if (m === BULL || m === BEAR) continue;
    let sc: number;
    if (m === TIGER) sc = 50;
    else {
      const suit = (m / 13) | 0;
      const rank = m % 13;
      const boss = liveTopRank(s, suit) === rank;
      const len = popcountSuit(s, seat, suit);
      if (boss) sc = (suit === s.trump ? 40 : 60) + cardMoneyK(m);
      else sc = len - rank / 13 - cardMoneyK(m);
    }
    if (sc > bestScore) {
      bestScore = sc;
      best = m;
    }
  }
  return best >= 0 ? best : (moves[0] as number);
}

function popcountSuit(s: PlayState, seat: number, suit: number): number {
  let x = s.hand[seat * 4 + suit] as number;
  let c = 0;
  while (x) {
    x &= x - 1;
    c += 1;
  }
  return c;
}

/** Strength if played now (or if it would set the suit when none is set yet). */
function strengthFor(s: PlayState, m: number): number {
  if (m === TIGER) return 1000;
  if (m >= 52) return -1;
  if (s.trickSuit >= 0) return s.strength(m);
  const suit = (m / 13) | 0;
  return suit === s.trump ? 100 + (m % 13) : m % 13;
}

function cheapest(s: PlayState, moves: Int32Array, n: number): number {
  let best = moves[0] as number;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    const m = moves[i] as number;
    let cost: number;
    if (m === BULL || m === BEAR) cost = 500;
    else if (m === TIGER) cost = 1000;
    else cost = cardMoneyK(m) * 4 + (m % 13) + (((m / 13) | 0) === s.trump ? 30 : 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = m;
    }
  }
  return best;
}

function hasMove(moves: Int32Array, n: number, card: number): boolean {
  for (let i = 0; i < n; i++) if (moves[i] === card) return true;
  return false;
}
