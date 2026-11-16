/**
 * A fast, mutable model of the play phase for search. Card ids match the engine
 * (suit·13 + rank for suit cards, 52 Tiger, 53 Bull, 54 Bear). Hands are bitmasks:
 * one 13-bit mask per seat and suit, plus a 3-bit mask of specials per seat.
 *
 * It must agree with the engine exactly; packages/search/test/playState.test.ts proves that
 * on random positions from real games.
 */

export const TIGER = 52;
export const BULL = 53;
export const BEAR = 54;

export const SPEC_TIGER = 1;
export const SPEC_BULL = 2;
export const SPEC_BEAR = 4;

/** Money by rank index, in $1000s. Ranks ascend: 1 2 3 4 $5k 7 8 9 $10k 11 $15k $30k $40k. */
export const MONEY_K = [0, 0, 0, 0, 5, 0, 0, 0, 10, 0, 15, 30, 40] as const;
/** Bitmask of the money ranks within a suit. */
export const MONEY_MASK = (1 << 4) | (1 << 8) | (1 << 10) | (1 << 11) | (1 << 12);

export function cardMoneyK(card: number): number {
  return card < 52 ? (MONEY_K[card % 13] as number) : 0;
}

const MAX_PLY = 64;

export class PlayState {
  /** hand[seat·4 + suit]: 13-bit rank mask. */
  readonly hand = new Int32Array(16);
  /** spec[seat]: SPEC_* bits. */
  readonly spec = new Int32Array(4);
  trump = 0;
  /** Seat to act. */
  turn = 0;
  /** Leader of the trick in progress. */
  leader = 0;
  readonly trickCards = new Int32Array(4);
  readonly trickSeats = new Int32Array(4);
  trickCount = 0;
  /** Suit to follow, or −1 while only the Bull/Bear (or nothing) has been played. */
  trickSuit = -1;
  /** Money captured this hand by team 0 and team 1, in $1000s. */
  cap0 = 0;
  cap1 = 0;
  /** Cards still in hands (not counting the trick in progress). */
  cardsInHands = 0;

  // Undo log, one entry per ply.
  private ply = 0;
  private readonly uCard = new Int32Array(MAX_PLY);
  private readonly uSeat = new Int32Array(MAX_PLY);
  private readonly uTrickSuit = new Int32Array(MAX_PLY);
  /** For plies that completed a trick: the winner (else −1) and the trick's value. */
  private readonly uWinner = new Int32Array(MAX_PLY);
  private readonly uValue = new Int32Array(MAX_PLY);
  private readonly uLeader = new Int32Array(MAX_PLY);
  /** Cards and seats of a completed trick, 4 per ply. */
  private readonly uTrick = new Int32Array(MAX_PLY * 8);

  clone(): PlayState {
    const s = new PlayState();
    s.hand.set(this.hand);
    s.spec.set(this.spec);
    s.trump = this.trump;
    s.turn = this.turn;
    s.leader = this.leader;
    s.trickCards.set(this.trickCards);
    s.trickSeats.set(this.trickSeats);
    s.trickCount = this.trickCount;
    s.trickSuit = this.trickSuit;
    s.cap0 = this.cap0;
    s.cap1 = this.cap1;
    s.cardsInHands = this.cardsInHands;
    return s;
  }

  has(seat: number, card: number): boolean {
    if (card < 52)
      return (((this.hand[seat * 4 + ((card / 13) | 0)] as number) >> (card % 13)) & 1) === 1;
    return ((this.spec[seat] as number) & (1 << (card - 52))) !== 0;
  }

  add(seat: number, card: number): void {
    if (card < 52) {
      const k = seat * 4 + ((card / 13) | 0);
      this.hand[k] = (this.hand[k] as number) | (1 << (card % 13));
    } else {
      this.spec[seat] = (this.spec[seat] as number) | (1 << (card - 52));
    }
    this.cardsInHands += 1;
  }

  private remove(seat: number, card: number): void {
    if (card < 52) {
      const k = seat * 4 + ((card / 13) | 0);
      this.hand[k] = (this.hand[k] as number) & ~(1 << (card % 13));
    } else {
      this.spec[seat] = (this.spec[seat] as number) & ~(1 << (card - 52));
    }
    this.cardsInHands -= 1;
  }

  handSize(seat: number): number {
    let n = popcount(this.spec[seat] as number);
    for (let s = 0; s < 4; s++) n += popcount(this.hand[seat * 4 + s] as number);
    return n;
  }

  /** True when every card has been played. */
  get done(): boolean {
    return this.cardsInHands === 0 && this.trickCount === 0;
  }

  /**
   * Writes the legal cards for the seat to act into `out`, returns how many.
   * Rules: see legal.ts playableCards in the engine.
   */
  legalMoves(out: Int32Array, offset = 0): number {
    const seat = this.turn;
    const base = seat * 4;
    const spec = this.spec[seat] as number;
    let n = offset;
    if (this.trickCount > 0 && this.trickSuit >= 0) {
      const follow = this.hand[base + this.trickSuit] as number;
      const tiger = this.trickSuit === this.trump && (spec & SPEC_TIGER) !== 0;
      if (follow !== 0 || tiger) {
        n = pushMask(out, n, follow, this.trickSuit * 13);
        if (tiger) out[n++] = TIGER;
        return n - offset;
      }
    }
    // Leading, no suit yet, or void: anything (except Bull/Bear when leading with other cards).
    for (let s = 0; s < 4; s++) n = pushMask(out, n, this.hand[base + s] as number, s * 13);
    if (spec & SPEC_TIGER) out[n++] = TIGER;
    const leading = this.trickCount === 0;
    if (!leading || n === offset) {
      if (spec & SPEC_BULL) out[n++] = BULL;
      if (spec & SPEC_BEAR) out[n++] = BEAR;
    }
    return n - offset;
  }

  /** Plays `card` for the seat to act. The caller guarantees legality. */
  play(card: number): void {
    const seat = this.turn;
    const p = this.ply++;
    this.uCard[p] = card;
    this.uSeat[p] = seat;
    this.uTrickSuit[p] = this.trickSuit;
    this.uWinner[p] = -1;
    this.remove(seat, card);
    this.trickCards[this.trickCount] = card;
    this.trickSeats[this.trickCount] = seat;
    this.trickCount += 1;
    if (this.trickSuit < 0 && card !== BULL && card !== BEAR) {
      this.trickSuit = card === TIGER ? this.trump : (card / 13) | 0;
    }
    if (this.trickCount < 4) {
      this.turn = (seat + 1) & 3;
      return;
    }
    const winner = this.trickWinner();
    const value = this.trickValueK();
    this.uWinner[p] = winner;
    this.uValue[p] = value;
    this.uLeader[p] = this.leader;
    for (let i = 0; i < 4; i++) {
      this.uTrick[p * 8 + i] = this.trickCards[i] as number;
      this.uTrick[p * 8 + 4 + i] = this.trickSeats[i] as number;
    }
    if ((winner & 1) === 0) this.cap0 += value;
    else this.cap1 += value;
    this.leader = winner;
    this.turn = winner;
    this.trickCount = 0;
    this.trickSuit = -1;
  }

  undo(): void {
    const p = --this.ply;
    const card = this.uCard[p] as number;
    const seat = this.uSeat[p] as number;
    const winner = this.uWinner[p] as number;
    if (winner >= 0) {
      const value = this.uValue[p] as number;
      if ((winner & 1) === 0) this.cap0 -= value;
      else this.cap1 -= value;
      this.leader = this.uLeader[p] as number;
      for (let i = 0; i < 4; i++) {
        this.trickCards[i] = this.uTrick[p * 8 + i] as number;
        this.trickSeats[i] = this.uTrick[p * 8 + 4 + i] as number;
      }
      this.trickCount = 4;
    }
    this.trickCount -= 1;
    this.trickSuit = this.uTrickSuit[p] as number;
    this.turn = seat;
    this.add(seat, card);
  }

  /** Seat currently winning the (possibly incomplete) trick, or −1. */
  trickWinner(): number {
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < this.trickCount; i++) {
      const score = this.strength(this.trickCards[i] as number);
      if (score > bestScore) {
        bestScore = score;
        best = this.trickSeats[i] as number;
      }
    }
    return best;
  }

  /** Mirrors trickStrength in the engine: Tiger > trumps by rank > trick suit by rank. */
  strength(card: number): number {
    if (card === TIGER) return 1000;
    if (card >= 52) return -1;
    const suit = (card / 13) | 0;
    const rank = card % 13;
    if (suit === this.trump) return 100 + rank;
    if (suit === this.trickSuit) return rank;
    return -1;
  }

  /** Money in the trick so far after the Bull/Bear rule, in $1000s. */
  trickValueK(): number {
    let money = 0;
    let modifier = 0;
    for (let i = 0; i < this.trickCount; i++) {
      const c = this.trickCards[i] as number;
      if (c === BULL) modifier = 1;
      else if (c === BEAR) modifier = 2;
      else money += cardMoneyK(c);
    }
    return modifier === 1 ? money * 2 : modifier === 2 ? 0 : money;
  }

  /**
   * Money still to be won, counting the Bull/Bear rule for the trick in progress (but not
   * for specials still in hands), in $1000s.
   */
  moneyOutK(): number {
    let face = 0;
    for (let i = 0; i < this.trickCount; i++) face += cardMoneyK(this.trickCards[i] as number);
    return this.remainingMoneyK() - face + this.trickValueK();
  }

  /** Money still to be won: cards in hands plus the trick in progress, in $1000s. */
  remainingMoneyK(): number {
    let money = 0;
    for (let k = 0; k < 16; k++) {
      const m = (this.hand[k] as number) & MONEY_MASK;
      if (m === 0) continue;
      for (let r = 4; r < 13; r++) if (m & (1 << r)) money += MONEY_K[r] as number;
    }
    for (let i = 0; i < this.trickCount; i++) money += cardMoneyK(this.trickCards[i] as number);
    return money;
  }

  /** Whether the Bull is still to be played (in a hand). */
  bullOut(): boolean {
    return (
      (((this.spec[0] as number) |
        (this.spec[1] as number) |
        (this.spec[2] as number) |
        (this.spec[3] as number)) &
        SPEC_BULL) !==
      0
    );
  }
}

export function popcount(x: number): number {
  let v = x - ((x >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function pushMask(out: Int32Array, n: number, mask: number, base: number): number {
  let m = mask;
  let i = n;
  while (m !== 0) {
    const low = m & -m;
    out[i++] = base + (31 - Math.clz32(low));
    m ^= low;
  }
  return i;
}
