import { type HardBot, makeSpecialsWeight } from '@mam/bots';
import {
  type Action,
  applyActionOrThrow,
  type GameState,
  type Observation,
  type Rng,
  type Seat,
  teamOf,
} from '@mam/engine';
import { buildBelief, type World } from '@mam/search';
import { finishHand } from './hindsight';
import type { OracleStrategy } from './strategies';

/**
 * The game as it would be if the unseen cards lay as in `world`, from `seat`'s view: the
 * other hands and the discards come from the world. The rest (auction, play so far, scores)
 * is public. Not being the bidder, the seat cannot know the widow either; the bidder's record
 * of it is replaced by the world's discards, which keeps every seat's view consistent.
 */
export function stateForWorld(state: GameState, seat: Seat, world: World): GameState {
  const hand = state.hand;
  if (!hand) throw new Error('stateForWorld: no hand');
  const hands = hand.hands.map((h, s) =>
    s === seat ? h : [...(world.hands[s] ?? [])],
  ) as unknown as typeof hand.hands;
  const bidder = hand.contract?.bidder;
  if (bidder === seat) return { ...state, hand: { ...hand, hands } };
  return { ...state, hand: { ...hand, hands, discards: [...world.pile], widow: [...world.pile] } };
}

/**
 * Diagnostic for PIMC's own flaws (strategy fusion; every player treated as seeing every
 * hand). In card play with `last` or fewer tricks left, this Hard-family bot samples worlds
 * exactly as its base does (same belief, same specials weighting), but values each legal card
 * by playing the rest of the hand out in each world with the base bot in all four seats,
 * rather than by solving the world with all hands open. Same information, a realistic model
 * of the play to come. Its margin over the base is what better search could gain there; the
 * `hybrid` oracle's margin over the same span is the whole gap, information included.
 *
 * It needs the game state only as a template for the public parts of each world.
 */
export class RolloutBot implements OracleStrategy {
  readonly id: string;
  readonly needsState = true as const;
  readonly rolloutBot: HardBot;

  constructor(
    private readonly base: HardBot,
    private readonly fromTricks = 3,
    private readonly worlds = 16,
  ) {
    this.rolloutBot = base;
    this.id = `rollout-last-${fromTricks}`;
  }

  async decideWithState(state: GameState, seat: Seat, obs: Observation, rng: Rng): Promise<Action> {
    const own = this.base.decide(obs, rng);
    if (obs.legal.kind !== 'play') return own;
    const live = obs.handSizes.reduce((a, b) => a + b, 0) + (obs.currentTrick?.plays.length ?? 0);
    if (live > this.fromTricks * 4 || obs.legal.cardIds.length < 2) return own;
    const sampled = this.sampleWorlds(obs, rng);
    const team = teamOf(seat);
    const bots = [this.base, this.base, this.base, this.base];
    const ownCard = own.type === 'playCard' ? own.cardId : -1;
    // The base's own card first, so ties keep it.
    const moves = [ownCard, ...obs.legal.cardIds.filter((c) => c !== ownCard)];
    const seed = `rollout:${rng.next()}`;
    let best = ownCard;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (const m of moves) {
      let total = 0;
      let weights = 0;
      for (let i = 0; i < sampled.length; i++) {
        const { world, w } = sampled[i] as { world: World; w: number };
        const s = applyActionOrThrow(stateForWorld(state, seat, world), seat, {
          type: 'playCard',
          cardId: m,
        }).state;
        // The same random streams for every card in a world: common random numbers.
        const end = await finishHand(s, bots, `${seed}:w${i}`, 0);
        const r = end.handHistory[end.handHistory.length - 1];
        if (!r) throw new Error('rollout: no hand result');
        total += w * ((r.captured[team] as number) - (r.captured[1 - team] as number));
        weights += w;
      }
      const value = total / weights;
      if (value > bestValue + 1e-9) {
        bestValue = value;
        best = m;
      }
    }
    return { type: 'playCard', cardId: best };
  }

  /** Every world when there are few, else a weighted resample, as the base's PIMC draws them. */
  private sampleWorlds(obs: Observation, rng: Rng): { world: World; w: number }[] {
    const o = this.base.options;
    const belief = buildBelief(obs);
    const weight = o.inferencePool > 0 && o.specialsInference ? makeSpecialsWeight(obs) : undefined;
    const all = belief.enumerate(this.worlds);
    if (all) return all.map((world) => ({ world, w: weight ? weight(world) : 1 }));
    const pool = Array.from({ length: this.worlds * Math.max(1, o.inferencePool) }, () =>
      belief.sample(rng),
    );
    if (!weight) return pool.slice(0, this.worlds).map((world) => ({ world, w: 1 }));
    const ws = pool.map(weight);
    const total = ws.reduce((a, b) => a + b, 0);
    if (!(total > 0)) return pool.slice(0, this.worlds).map((world) => ({ world, w: 1 }));
    // Systematic resampling, as in the base's PIMC.
    const out: { world: World; w: number }[] = [];
    const step = total / this.worlds;
    let u = rng.next() * step;
    let acc = 0;
    let i = 0;
    for (let k = 0; k < this.worlds; k++) {
      while (i < pool.length - 1 && acc + (ws[i] as number) < u) {
        acc += ws[i] as number;
        i += 1;
      }
      out.push({ world: pool[i] as World, w: 1 });
      u += step;
    }
    return out;
  }
}
