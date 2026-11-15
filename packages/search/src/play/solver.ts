import { greedyPlayout } from './playout';
import { BEAR, BULL, cardMoneyK, MONEY_K, type PlayState, TIGER } from './state';

/** Team 0's value of a finished hand from the money each team captured (in $1000s). */
export type LeafUtility = (cap0K: number, cap1K: number) => number;

export interface SolverOptions {
  /**
   * 'linear': value = team 0's capture minus team 1's from here to the end, in $1000s.
   *   Cached results don't depend on money already won, so this is the fastest mode.
   * 'utility': value = `utility(final captures)`, any function (e.g. match equity).
   */
  readonly mode: 'linear' | 'utility';
  readonly utility?: LeafUtility;
  /** Clear the cache when it grows past this many entries. */
  readonly maxEntries?: number;
}

export interface RootValues {
  /** Every legal card at the root. */
  readonly moves: readonly number[];
  /** Team 0's exact value after playing each move (same order). */
  readonly values: readonly number[];
}

const MAX_PLY = 64;
const MOVES_PER_PLY = 16;

/** Thrown when a search exceeds its node budget. The solver's cache stays valid. */
export class SearchAborted extends Error {
  constructor(message = 'search node budget exceeded') {
    super(message);
    this.name = 'SearchAborted';
  }
}

/** Thrown when a search runs past its wall-clock deadline (see Solver.deadline). */
export class DeadlineExceeded extends SearchAborted {
  constructor() {
    super('search deadline passed');
    this.name = 'DeadlineExceeded';
  }
}

/** Nodes searched between clock checks (about a millisecond). */
const CLOCK_EVERY = 2048;

/** Money class (0–5) of each rank, for cache keys. */
const MONEY_CLASS = [0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 3, 4, 5] as const;

/**
 * Exact alpha-beta search of a position with every hand known ("open hands").
 * Team 0 maximises, team 1 minimises; values are always from team 0's side.
 * Results are cached at trick boundaries; cards that are interchangeable (same holder,
 * adjacent among live cards of their suit, same money) are searched once.
 */
export class Solver {
  nodes = 0;
  private s!: PlayState;
  private readonly linear: boolean;
  private readonly utility: LeafUtility;
  private readonly maxEntries: number;
  private readonly table = new Map<number, number>();
  private lo: Float64Array = new Float64Array(1 << 16);
  private hi: Float64Array = new Float64Array(1 << 16);
  private best: Int32Array = new Int32Array(1 << 16);
  private used = 0;
  private readonly moveBuf = new Int32Array(MAX_PLY * MOVES_PER_PLY);
  private readonly scoreBuf = new Float64Array(MAX_PLY * MOVES_PER_PLY);

  constructor(opts: SolverOptions) {
    this.linear = opts.mode === 'linear';
    if (!this.linear && !opts.utility) throw new Error("utility mode needs 'utility'");
    this.utility = opts.utility ?? (() => 0);
    this.maxEntries = opts.maxEntries ?? 2_000_000;
  }

  clear(): void {
    this.table.clear();
    this.used = 0;
  }

  /** Exact value of the position for team 0 (see SolverOptions.mode). */
  solve(
    state: PlayState,
    alpha = Number.NEGATIVE_INFINITY,
    beta = Number.POSITIVE_INFINITY,
  ): number {
    this.attach(state);
    return this.search(0, alpha, beta);
  }

  /**
   * Exact linear-mode value by MTD(f): a sequence of null-window searches that converge
   * on the value, reusing the cache. Values are multiples of $5k, so a window of 1 is exact.
   */
  solveMtd(state: PlayState, guess = 0): number {
    if (!this.linear) return this.solve(state);
    this.attach(state);
    return this.mtd(0, guess, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
  }

  private mtd(ply: number, guess: number, lowerIn: number, upperIn: number): number {
    let g = guess;
    let lower = lowerIn;
    let upper = upperIn;
    while (lower < upper) {
      const beta = g === lower ? g + 1 : g;
      g = this.search(ply, beta - 1, beta);
      if (g < beta) upper = g;
      else lower = g;
    }
    return g;
  }

  /** Exact value of every legal move at the root. */
  rootValues(state: PlayState): RootValues {
    this.attach(state);
    const s = this.s;
    const buf = new Int32Array(MOVES_PER_PLY);
    const n = s.legalMoves(buf);
    const moves: number[] = [];
    const values: number[] = [];
    const seen = new Map<number, number>();
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const m = buf[i] as number;
      const rep = this.representative(m);
      let v = seen.get(rep);
      if (v === undefined) {
        v = this.linear
          ? this.childMtd(m, prev)
          : this.child(0, m, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
        seen.set(rep, v);
        prev = v;
      }
      moves.push(m);
      values.push(v);
    }
    return { moves, values };
  }

  /**
   * Search only this many tricks ahead, then estimate the rest with a greedy playout
   * (Infinity = exact). Set per call by the caller.
   */
  depthTricks = Number.POSITIVE_INFINITY;
  private rootLive = 0;
  private readonly playout = { d0: 0, d1: 0 };

  private attach(state: PlayState): void {
    this.s = state;
    this.rootLive = state.cardsInHands + state.trickCount;
  }

  /** Root move value by MTD(f) (linear mode): exact, and usually faster than a full window. */
  private childMtd(m: number, guess: number): number {
    const s = this.s;
    const before = s.cap0 - s.cap1;
    s.play(m);
    const delta = s.cap0 - s.cap1 - before;
    const v =
      delta + this.mtd(1, guess - delta, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
    s.undo();
    return v;
  }

  /** Plays m, searches, undoes. Returns team 0's value including any trick m completes. */
  private child(ply: number, m: number, alpha: number, beta: number): number {
    const s = this.s;
    const before = s.cap0 - s.cap1;
    s.play(m);
    let v: number;
    if (this.linear) {
      const delta = s.cap0 - s.cap1 - before;
      v = delta + this.search(ply + 1, alpha - delta, beta - delta);
    } else {
      v = this.search(ply + 1, alpha, beta);
    }
    s.undo();
    return v;
  }

  /** Abort with SearchAborted once `nodes` passes this (set per call by the caller). */
  nodeLimit = Number.POSITIVE_INFINITY;
  /**
   * Abort with DeadlineExceeded once the clock (Date.now()) passes this. A safety net for
   * live play only: unlike node limits, it makes results depend on machine speed.
   */
  deadline = Number.POSITIVE_INFINITY;
  private clockAt = CLOCK_EVERY;

  private search(ply: number, alphaIn: number, betaIn: number): number {
    const s = this.s;
    this.nodes += 1;
    if (this.nodes > this.nodeLimit) throw new SearchAborted();
    if (this.nodes >= this.clockAt) {
      this.clockAt = this.nodes + CLOCK_EVERY;
      if (Date.now() > this.deadline) throw new DeadlineExceeded();
    }
    if (s.done) return this.linear ? 0 : this.utility(s.cap0, s.cap1);
    if (
      s.trickCount === 0 &&
      this.depthTricks !== Number.POSITIVE_INFINITY &&
      (this.rootLive - s.cardsInHands) / 4 >= this.depthTricks
    ) {
      // Count the playout's plies as nodes so budgets track real cost.
      this.nodes += greedyPlayout(s, this.playout);
      const { d0, d1 } = this.playout;
      return this.linear ? d0 - d1 : this.utility(s.cap0 + d0, s.cap1 + d1);
    }
    let alpha = alphaIn;
    let beta = betaIn;

    // Cheap bounds on what is left to win.
    if (this.linear && s.trickCount === 0) {
      const rem = s.remainingMoneyK();
      const bound = s.bullOut() ? rem * 2 : rem;
      if (bound <= alpha) return bound;
      if (-bound >= beta) return -bound;
    }

    let entry = -1;
    let ttMove = -1;
    let key = 0;
    if (s.trickCount === 0) {
      key = this.key();
      const found = this.table.get(key);
      if (found !== undefined) {
        entry = found;
        const lo = this.lo[entry] as number;
        const hi = this.hi[entry] as number;
        if (lo >= beta) return lo;
        if (hi <= alpha) return hi;
        if (lo === hi) return lo;
        if (lo > alpha) alpha = lo;
        if (hi < beta) beta = hi;
        ttMove = this.best[entry] as number;
      }
    }

    const base = ply * MOVES_PER_PLY;
    const n = this.orderedMoves(base, ttMove);
    const maximizing = (s.turn & 1) === 0;
    let best = maximizing ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    let bestMove = this.moveBuf[base] as number;
    const a0 = alpha;
    const b0 = beta;
    for (let i = 0; i < n; i++) {
      const m = this.moveBuf[base + i] as number;
      const v = this.child(ply, m, alpha, beta);
      if (maximizing) {
        if (v > best) {
          best = v;
          bestMove = m;
          if (v > alpha) alpha = v;
        }
      } else if (v < best) {
        best = v;
        bestMove = m;
        if (v < beta) beta = v;
      }
      if (alpha >= beta) break;
    }

    if (s.trickCount === 0) this.store(key, entry, best, a0, b0, bestMove);
    return best;
  }

  /**
   * Cache key by *relative* ranks: for each suit, the holder and money class of every live
   * card in rank order, plus who holds the specials and who leads. Positions that differ only
   * in which lower cards have already gone are the same game, so they share one entry.
   */
  private key(): number {
    const s = this.s;
    const hand = s.hand;
    let a = Math.imul(0x811c9dc5 ^ (s.leader | (s.trump << 2)), 0x01000193);
    let b = Math.imul(0x2545f491 ^ (s.leader * 7 + s.trump * 131), 0x5bd1e995);
    for (let suit = 0; suit < 4; suit++) {
      const m1 = hand[4 + suit] as number;
      const m2 = hand[8 + suit] as number;
      const m3 = hand[12 + suit] as number;
      let live = (hand[suit] as number) | m1 | m2 | m3;
      while (live !== 0) {
        const low = live & -live;
        const holder = m1 & low ? 1 : m2 & low ? 2 : m3 & low ? 3 : 0;
        const code = 64 | holder | ((MONEY_CLASS[31 - Math.clz32(low)] as number) << 2);
        a = Math.imul(a ^ code, 0x01000193);
        b = Math.imul(b ^ code, 0x5bd1e995);
        b ^= b >>> 13;
        live ^= low;
      }
      a = Math.imul(a ^ 0xff, 0x01000193);
      b = Math.imul(b ^ 0xff, 0x5bd1e995);
    }
    for (let bit = 1; bit <= 4; bit <<= 1) {
      let holder = 4;
      for (let seat = 0; seat < 4; seat++) if ((s.spec[seat] as number) & bit) holder = seat;
      a = Math.imul(a ^ (128 | holder), 0x01000193);
      b = Math.imul(b ^ (128 | holder), 0x5bd1e995);
      b ^= b >>> 13;
    }
    if (this.depthTricks !== Number.POSITIVE_INFINITY) {
      const left = this.depthTricks - (this.rootLive - s.cardsInHands) / 4;
      a = Math.imul(a ^ (0x5a00 + left), 0x01000193);
      b = Math.imul(b ^ (0x5a00 + left), 0x5bd1e995);
    }
    if (!this.linear) {
      // The utility depends on money already won, so it is part of the position.
      a ^= Math.imul(s.cap0 + 1, 0x27d4eb2d) ^ Math.imul(s.cap1 + 7, 0x165667b1);
      b ^= Math.imul(s.cap0 + 3, 0x85ebca6b) ^ Math.imul(s.cap1 + 11, 0xc2b2ae35);
    }
    return (a >>> 0) * 1048576 + (b >>> 12);
  }

  private store(key: number, entry: number, v: number, a0: number, b0: number, move: number): void {
    let e = entry;
    if (e < 0) {
      if (this.used >= this.maxEntries) this.clear();
      if (this.used >= this.lo.length) this.grow();
      e = this.used++;
      this.lo[e] = Number.NEGATIVE_INFINITY;
      this.hi[e] = Number.POSITIVE_INFINITY;
      this.table.set(key, e);
    }
    if (v <= a0) this.hi[e] = Math.min(this.hi[e] as number, v);
    else if (v >= b0) this.lo[e] = Math.max(this.lo[e] as number, v);
    else {
      this.lo[e] = v;
      this.hi[e] = v;
    }
    this.best[e] = move;
  }

  private grow(): void {
    const size = this.lo.length * 2;
    const lo = new Float64Array(size);
    const hi = new Float64Array(size);
    const best = new Int32Array(size);
    lo.set(this.lo);
    hi.set(this.hi);
    best.set(this.best);
    this.lo = lo;
    this.hi = hi;
    this.best = best;
  }

  /**
   * The card that stands for `m` among interchangeable cards: same holder, same suit, no
   * live card of that suit between them, and the same money value.
   */
  private representative(m: number): number {
    if (m >= 52) return m;
    const s = this.s;
    const suit = (m / 13) | 0;
    const own = s.hand[s.turn * 4 + suit] as number;
    let live = 0;
    for (let seat = 0; seat < 4; seat++) live |= s.hand[seat * 4 + suit] as number;
    for (let i = 0; i < s.trickCount; i++) {
      const c = s.trickCards[i] as number;
      if (c < 52 && ((c / 13) | 0) === suit) live |= 1 << (c % 13);
    }
    let r = m % 13;
    for (;;) {
      const above = live & ~((2 << r) - 1);
      if (above === 0) return suit * 13 + r;
      const next = 31 - Math.clz32(above & -above);
      if (!(own & (1 << next)) || MONEY_K[next] !== MONEY_K[r]) return suit * 13 + r;
      r = next;
    }
  }

  /** Fills moveBuf[base..] with distinct, ordered moves; returns the count. */
  private orderedMoves(base: number, ttMove: number): number {
    const s = this.s;
    const raw = s.legalMoves(this.moveBuf, base);
    let n = 0;
    for (let i = 0; i < raw; i++) {
      const m = this.moveBuf[base + i] as number;
      if (this.representative(m) !== m) continue;
      this.moveBuf[base + n] = m;
      this.scoreBuf[base + n] = m === ttMove ? 1e9 : this.moveScore(m);
      n += 1;
    }
    // Insertion sort, best first.
    for (let i = base + 1; i < base + n; i++) {
      const m = this.moveBuf[i] as number;
      const sc = this.scoreBuf[i] as number;
      let j = i - 1;
      while (j >= base && (this.scoreBuf[j] as number) < sc) {
        this.moveBuf[j + 1] = this.moveBuf[j] as number;
        this.scoreBuf[j + 1] = this.scoreBuf[j] as number;
        j -= 1;
      }
      this.moveBuf[j + 1] = m;
      this.scoreBuf[j + 1] = sc;
    }
    return n;
  }

  /** Move-ordering heuristic: cheap winners, feeding a winning partner, low discards. */
  private moveScore(m: number): number {
    const s = this.s;
    const money = cardMoneyK(m);
    if (s.trickCount === 0) {
      if (m === BULL || m === BEAR) return -100;
      const rank = m === TIGER ? 14 : m % 13;
      const trump = m === TIGER || ((m / 13) | 0) === s.trump;
      return rank + (trump ? 5 : 0);
    }
    const winner = s.trickWinner();
    let winStrength = -1;
    for (let i = 0; i < s.trickCount; i++) {
      winStrength = Math.max(winStrength, s.strength(s.trickCards[i] as number));
    }
    const partnerWinning = winner >= 0 && ((winner ^ s.turn) & 1) === 0;
    const strength = this.followStrength(m);
    if (m === BULL) return partnerWinning ? 60 : -50;
    if (m === BEAR) return partnerWinning ? -50 : 60;
    if (partnerWinning) return 40 + money - (strength > winStrength ? 20 : 0);
    if (strength > winStrength) return 100 - strength / 20;
    return 20 - money - (strength > 0 ? strength / 50 : 0);
  }

  private followStrength(m: number): number {
    const s = this.s;
    if (s.trickSuit >= 0) return s.strength(m);
    // No suit yet: this card would set it.
    if (m === TIGER) return 1000;
    if (m >= 52) return -1;
    const suit = (m / 13) | 0;
    return suit === s.trump ? 100 + (m % 13) : m % 13;
  }
}
