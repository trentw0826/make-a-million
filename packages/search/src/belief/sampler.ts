import {
  type CardId,
  cardById,
  DECK,
  effectiveSuit,
  isNumberCard,
  type Observation,
  type Rng,
  type Seat,
  type Suit,
  type Trick,
} from '@mam/engine';

/**
 * Where the unseen cards can be, from one seat's point of view, and an exact uniform sampler
 * over every arrangement consistent with it.
 *
 * Holders are the three other seats plus the "pile": the widow before the auction ends, or
 * the bidder's discards afterwards (unknown to everyone but the bidder).
 *
 * Hard constraints (see docs/bot-standards.md: all derived from permitted information):
 * - hand sizes;
 * - voids: a seat that failed to follow a suit holds none of it (failing trump: no Tiger);
 * - a seat that led the Bull or Bear held nothing but specials;
 * - discards are never specials, and are number cards (the discard rule forces this unless the
 *   bidder held fewer than three number cards among 16, which is negligibly rare).
 */
export interface Belief {
  readonly observer: Seat;
  /** Holder index 0–2 = these seats, 3 = pile. */
  readonly seats: readonly [Seat, Seat, Seat];
  readonly capacity: readonly [number, number, number, number];
  readonly unseen: readonly CardId[];
  /** Number of consistent arrangements (as a float; can be astronomically large). */
  readonly count: number;
  /** Draws one arrangement uniformly: hands for the three other seats and the pile. */
  sample(rng: Rng): World;
  /** Every consistent arrangement (each equally likely), or null if there are more than `max`. */
  enumerate(max: number): World[] | null;
}

export interface World {
  /** hands[seat] for the three other seats; the observer's entry is empty. */
  readonly hands: readonly (readonly CardId[])[];
  readonly pile: readonly CardId[];
}

const PILE = 3;

/** Seats known to hold no cards of a suit, from the play so far. */
export function voidsFrom(
  tricks: readonly Trick[],
  current: Trick | null,
  trump: Suit | null,
): Map<Seat, Set<Suit | 'all'>> {
  const voids = new Map<Seat, Set<Suit | 'all'>>();
  const add = (seat: Seat, v: Suit | 'all') => {
    let set = voids.get(seat);
    if (!set) {
      set = new Set();
      voids.set(seat, set);
    }
    set.add(v);
  };
  const all = current ? [...tricks, current] : tricks;
  for (const t of all) {
    let suit: Suit | null = null;
    t.plays.forEach((p, i) => {
      const card = cardById(p.cardId);
      if (i === 0 && (card.kind === 'bull' || card.kind === 'bear')) add(p.seat, 'all');
      const eff = effectiveSuit(card, trump);
      if (suit !== null && eff !== suit) add(p.seat, suit);
      if (suit === null && eff !== null) suit = eff;
    });
  }
  return voids;
}

interface Group {
  readonly cards: readonly CardId[];
  /** Bitmask of holders (0–3) allowed to hold cards of this group. */
  readonly allowed: number;
}

export function buildBelief(obs: Observation): Belief {
  const observer = obs.seat;
  const others = [0, 1, 2, 3].filter((s) => s !== observer) as [Seat, Seat, Seat];
  const known = new Set<CardId>(obs.hand);
  const played: Trick[] = [...obs.tricks];
  if (obs.currentTrick) played.push(obs.currentTrick);
  for (const t of played) for (const p of t.plays) known.add(p.cardId);

  const bidder = obs.contract?.bidder ?? null;
  const iAmBidder = bidder === observer;
  // The pile: the widow until the auction ends; the discards once the bidder has made them.
  // While the bidder holds 16 cards there is no pile. The bidder knows both.
  const discarded = obs.contract !== null && obs.phase !== 'discarding';
  if (iAmBidder) {
    for (const c of obs.discards ?? []) known.add(c);
    for (const c of obs.widow ?? []) known.add(c);
  }
  const pileSize = iAmBidder || (obs.contract !== null && !discarded) ? 0 : 3;
  const unseen = DECK.map((c) => c.id).filter((id) => !known.has(id));

  const capacity: [number, number, number, number] = [
    obs.handSizes[others[0]],
    obs.handSizes[others[1]],
    obs.handSizes[others[2]],
    pileSize,
  ];
  // Before the auction ends the bidder's widow is not yet in any hand; after it, the bidder's
  // hand size already reflects pickup and discard. Either way capacities sum to |unseen|.
  if (capacity.reduce((a, b) => a + b, 0) !== unseen.length) {
    throw new Error(
      `belief: ${unseen.length} unseen cards but capacity ${capacity.join('+')} (phase ${obs.phase})`,
    );
  }

  const voids = voidsFrom(obs.tricks, obs.currentTrick, obs.trump);
  const holderAllowed = (holder: number, card: CardId): boolean => {
    if (holder === PILE) {
      const c = cardById(card);
      if (!discarded) return true; // widow: anything
      return c.kind === 'suit' && isNumberCard(c);
    }
    const seat = others[holder] as Seat;
    const v = voids.get(seat);
    if (!v) return true;
    const c = cardById(card);
    if (v.has('all')) return c.kind === 'bull' || c.kind === 'bear';
    const eff = effectiveSuit(c, obs.trump);
    return eff === null || !v.has(eff);
  };

  // Group cards that share the same set of allowed holders (order within a group is free).
  const byMask = new Map<number, CardId[]>();
  for (const card of unseen) {
    let mask = 0;
    for (let h = 0; h < 4; h++)
      if ((capacity[h] as number) > 0 && holderAllowed(h, card)) mask |= 1 << h;
    const list = byMask.get(mask) ?? [];
    list.push(card);
    byMask.set(mask, list);
  }
  const groups: Group[] = [...byMask.entries()].map(([allowed, cards]) => ({ allowed, cards }));
  return new DpBelief(observer, others, capacity, unseen, groups);
}

/** Exact counting and uniform sampling by dynamic programming over card groups. */
class DpBelief implements Belief {
  readonly count: number;
  private readonly memo = new Map<number, number>();

  constructor(
    readonly observer: Seat,
    readonly seats: readonly [Seat, Seat, Seat],
    readonly capacity: readonly [number, number, number, number],
    readonly unseen: readonly CardId[],
    private readonly groups: readonly Group[],
  ) {
    this.count = this.ways(0, capacity[0], capacity[1], capacity[2], capacity[3]);
    if (!(this.count > 0)) throw new Error('belief: no consistent arrangement of unseen cards');
  }

  /** Arrangements of groups g.. into remaining capacities (c0..c3). */
  private ways(g: number, c0: number, c1: number, c2: number, c3: number): number {
    if (g === this.groups.length) return c0 === 0 && c1 === 0 && c2 === 0 && c3 === 0 ? 1 : 0;
    const key = (((g * 16 + c0) * 16 + c1) * 16 + c2) * 4 + c3;
    const hit = this.memo.get(key);
    if (hit !== undefined) return hit;
    let total = 0;
    this.forSplits(g, c0, c1, c2, c3, (x, weight) => {
      total += weight * this.ways(g + 1, c0 - x[0], c1 - x[1], c2 - x[2], c3 - x[3]);
    });
    this.memo.set(key, total);
    return total;
  }

  /** Every way to split group g's cards among allowed holders within capacities. */
  private forSplits(
    g: number,
    c0: number,
    c1: number,
    c2: number,
    c3: number,
    visit: (x: readonly [number, number, number, number], weight: number) => void,
  ): void {
    const group = this.groups[g] as Group;
    const n = group.cards.length;
    const caps = [c0, c1, c2, c3];
    const x: [number, number, number, number] = [0, 0, 0, 0];
    const rec = (h: number, left: number) => {
      if (h === 3) {
        const can = group.allowed & 8 ? (caps[3] as number) : 0;
        if (left > can) return;
        x[3] = left;
        visit(x, multinomial(n, x));
        return;
      }
      const max = group.allowed & (1 << h) ? Math.min(left, caps[h] as number) : 0;
      for (let k = 0; k <= max; k++) {
        x[h] = k;
        rec(h + 1, left - k);
      }
      x[h] = 0;
    };
    rec(0, n);
  }

  enumerate(max: number): World[] | null {
    if (this.count > max) return null;
    const out: World[] = [];
    const holders: CardId[][] = [[], [], [], []];
    const rec = (g: number, c: readonly [number, number, number, number]) => {
      if (g === this.groups.length) {
        if (c.some((x) => x !== 0)) return;
        const hands: CardId[][] = [[], [], [], []];
        for (let h = 0; h < 3; h++) {
          hands[this.seats[h] as Seat] = [...(holders[h] as CardId[])].sort((a, b) => a - b);
        }
        out.push({ hands, pile: [...(holders[3] as CardId[])].sort((a, b) => a - b) });
        return;
      }
      const cards = (this.groups[g] as Group).cards;
      const splits: [number, number, number, number][] = [];
      this.forSplits(g, c[0], c[1], c[2], c[3], (x) => {
        if (this.ways(g + 1, c[0] - x[0], c[1] - x[1], c[2] - x[2], c[3] - x[3]) > 0) {
          splits.push([...x]);
        }
      });
      for (const x of splits) {
        // Every way to deal this group's cards into holders with these counts.
        const assign = (h: number, rest: readonly CardId[]) => {
          if (h === 4) {
            rec(g + 1, [c[0] - x[0], c[1] - x[1], c[2] - x[2], c[3] - x[3]]);
            return;
          }
          const k = x[h] as number;
          const target = holders[h] as CardId[];
          for (const pick of choose(rest, k)) {
            target.push(...pick);
            assign(
              h + 1,
              rest.filter((r) => !pick.includes(r)),
            );
            target.length -= k;
          }
        };
        assign(0, cards);
      }
    };
    rec(0, [...this.capacity]);
    return out;
  }

  sample(rng: Rng): World {
    const holders: CardId[][] = [[], [], [], []];
    let c: [number, number, number, number] = [...this.capacity];
    for (let g = 0; g < this.groups.length; g++) {
      const options: { x: [number, number, number, number]; w: number }[] = [];
      let total = 0;
      this.forSplits(g, c[0], c[1], c[2], c[3], (x, weight) => {
        const w = weight * this.ways(g + 1, c[0] - x[0], c[1] - x[1], c[2] - x[2], c[3] - x[3]);
        if (w > 0) {
          options.push({ x: [...x], w });
          total += w;
        }
      });
      let r = rng.next() * total;
      let chosen = options[options.length - 1] as (typeof options)[0];
      for (const o of options) {
        r -= o.w;
        if (r < 0) {
          chosen = o;
          break;
        }
      }
      const cards = rng.shuffle([...(this.groups[g] as Group).cards]);
      let at = 0;
      for (let h = 0; h < 4; h++) {
        const take = chosen.x[h] as number;
        for (let k = 0; k < take; k++) (holders[h] as CardId[]).push(cards[at++] as CardId);
      }
      c = [c[0] - chosen.x[0], c[1] - chosen.x[1], c[2] - chosen.x[2], c[3] - chosen.x[3]];
    }
    const hands: CardId[][] = [[], [], [], []];
    for (let h = 0; h < 3; h++) {
      hands[this.seats[h] as Seat] = (holders[h] as CardId[]).sort((a, b) => a - b);
    }
    return { hands, pile: (holders[3] as CardId[]).sort((a, b) => a - b) };
  }
}

const FACT: number[] = [1];
for (let i = 1; i <= 60; i++) FACT.push((FACT[i - 1] as number) * i);

/** All k-element subsets of items. */
function choose<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const acc: T[] = [];
  const rec = (start: number) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i <= items.length - (k - acc.length); i++) {
      acc.push(items[i] as T);
      rec(i + 1);
      acc.pop();
    }
  };
  rec(0);
  return out;
}

function multinomial(n: number, x: readonly number[]): number {
  let r = FACT[n] as number;
  for (const k of x) r /= FACT[k] as number;
  return r;
}
