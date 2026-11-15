import { type CardId, type Observation, type Rng, teamOf } from '@mam/engine';
import {
  type Belief,
  buildBelief,
  type LeafUtility,
  playStateFromWorld,
  SearchAborted,
  Solver,
  type World,
} from '@mam/search';

export interface PimcOptions {
  /** Most worlds sampled per decision. */
  readonly worlds: number;
  /** Total search-node budget per decision (deterministic, unlike a clock). */
  readonly nodes: number;
  /** Solve exactly when this many tricks or fewer remain (counting the one in progress). */
  readonly exactTricks: number;
  /** Otherwise search this many tricks deep and estimate the rest. */
  readonly depth: number;
  /** Node cap for one world before retrying it one trick shallower. */
  readonly worldNodes: number;
  /**
   * Soft inference: draw this many times `worlds` candidate worlds, weight each by how well
   * it explains the bidding and trump choice, and resample. 0 turns inference off.
   */
  readonly inferencePool: number;
}

export const PIMC_DEFAULTS: PimcOptions = {
  worlds: 40,
  nodes: 4_000_000,
  exactTricks: 6,
  depth: 2,
  worldNodes: 400_000,
  inferencePool: 0,
};

/** Draws worlds for a decision: uniformly, or resampled by an inference weight. */
function worldSource(
  belief: Belief,
  rng: Rng,
  count: number,
  weight: ((w: World) => number) | undefined,
  pool: number,
): () => World {
  if (!weight || pool <= 0) return () => belief.sample(rng);
  const candidates = Array.from({ length: count * pool }, () => belief.sample(rng));
  const weights = candidates.map(weight);
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return () => belief.sample(rng);
  // Systematic resampling: low variance, deterministic given the rng.
  const chosen: World[] = [];
  const stepW = total / count;
  let u = rng.next() * stepW;
  let acc = 0;
  let i = 0;
  for (let k = 0; k < count; k++) {
    while (i < candidates.length - 1 && acc + (weights[i] as number) < u) {
      acc += weights[i] as number;
      i += 1;
    }
    chosen.push(candidates[i] as World);
    u += stepW;
  }
  let next = 0;
  return () => (next < chosen.length ? (chosen[next++] as World) : belief.sample(rng));
}

export interface PimcResult {
  readonly moves: readonly CardId[];
  /** Mean value of each move for the deciding seat's team (higher is better). */
  readonly means: readonly number[];
  readonly worlds: number;
  readonly nodes: number;
}

/**
 * Perfect-information Monte Carlo: sample arrangements of the unseen cards consistent with
 * the observation, solve each with all hands open, and average each legal card's value.
 * `utility` (team 0's value of final captures) switches the solver from points to e.g.
 * match equity; omitted, values are points ($1000s, own team minus opponents).
 */
export function pimcValues(
  obs: Observation,
  rng: Rng,
  opts: PimcOptions,
  utility?: LeafUtility,
  weight?: (world: World) => number,
  belief: Belief = buildBelief(obs),
): PimcResult {
  // Few enough arrangements left: list them all (exact expectation over the belief).
  const all = belief.enumerate(opts.worlds);
  const allWeights = all ? all.map((w) => (weight ? weight(w) : 1)) : null;
  if (allWeights && !(allWeights.reduce((a, b) => a + b, 0) > 0)) allWeights.fill(1);
  const draw = all ? null : worldSource(belief, rng, opts.worlds, weight, opts.inferencePool);
  let enumIndex = 0;
  const next = (): { world: World; w: number } | null => {
    if (all && allWeights) {
      if (enumIndex >= all.length) return null;
      const i = enumIndex++;
      return { world: all[i] as World, w: allWeights[i] as number };
    }
    return { world: (draw as () => World)(), w: 1 };
  };
  const legal = obs.legal.kind === 'play' ? obs.legal.cardIds : [];
  const sums = new Map<CardId, number>(legal.map((c) => [c, 0]));
  const sign = teamOf(obs.seat) === 0 ? 1 : -1;
  const solver = new Solver(
    utility
      ? { mode: 'utility', utility, maxEntries: 400_000 }
      : { mode: 'linear', maxEntries: 400_000 },
  );
  const live = obs.handSizes.reduce((a, b) => a + b, 0) + (obs.currentTrick?.plays.length ?? 0);
  const exact = live <= opts.exactTricks * 4;
  let worlds = 0;
  let weightTotal = 0;
  // Depth for this decision. It only ever gets shallower: once one world has needed a
  // shallower search, the rest use it too, so every world is valued the same way.
  let depth = exact ? Number.POSITIVE_INFINITY : opts.depth;

  outer: while ((all || worlds < opts.worlds) && solver.nodes < opts.nodes) {
    const item = next();
    if (!item) break;
    const { world, w } = item;
    let result: { moves: readonly number[]; values: readonly number[] } | null = null;
    while (!result) {
      const state = playStateFromWorld(obs, world.hands);
      solver.depthTricks = depth;
      const left = opts.nodes - solver.nodes;
      solver.nodeLimit =
        depth <= 1 ? Number.POSITIVE_INFINITY : solver.nodes + Math.min(opts.worldNodes, left);
      try {
        result = solver.rootValues(state);
      } catch (e) {
        if (!(e instanceof SearchAborted)) throw e;
        // Out of total budget with some worlds done: stop. Otherwise go shallower.
        if (worlds > 0 && solver.nodes >= opts.nodes) break outer;
        depth = depth === Number.POSITIVE_INFINITY ? Math.max(1, opts.depth) : depth - 1;
        if (worlds > 0) {
          // Values so far were computed deeper; restart the averages at the new depth.
          for (const m of sums.keys()) sums.set(m, 0);
          worlds = 0;
          weightTotal = 0;
          if (all) {
            enumIndex = 0;
            continue outer;
          }
        }
      }
    }
    result.moves.forEach((m, i) => {
      sums.set(m, (sums.get(m) ?? 0) + w * sign * (result.values[i] as number));
    });
    worlds += 1;
    weightTotal += w;
  }
  const moves = [...sums.keys()];
  return {
    moves,
    means: moves.map((m) => (sums.get(m) as number) / (weightTotal > 0 ? weightTotal : 1)),
    worlds,
    nodes: solver.nodes,
  };
}
