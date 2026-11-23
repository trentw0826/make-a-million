import { type Action, type CardId, type Observation, Rng, teamOf } from '@mam/engine';
import { buildPlayState, Solver } from '@mam/search';
import { playGame } from './runner';
import { type BotSpec, isOracle, makeStrategy } from './strategies';
import type { PlayInput } from './tasks';

/**
 * A decision bank: observations collected from self-play, kept so that a bot's decisions
 * can be timed or compared one by one on the same positions (scripts/timing-bank.ts).
 */
export interface BankEntry {
  /** 'misdeal' (a bid turn that may call one), 'bid', 'discard', 'trump' or 'play'. */
  readonly kind: string;
  /** Cards still in hands plus the trick in progress. */
  readonly live: number;
  readonly legal: number;
  /** Seed for the decision's random stream. */
  readonly seed: string;
  readonly obs: Observation;
  /**
   * The true hands of all four seats at the decision (simulator diagnostics only: the bot
   * deciding never sees them). Lets a card play be scored against the true deal.
   */
  readonly hands?: readonly (readonly CardId[])[];
}

/**
 * Plays one hand and returns the observation at every decision with a choice (card plays
 * with one legal card are skipped), with the true hands.
 */
export async function bankTask(input: PlayInput): Promise<BankEntry[]> {
  const strategies = input.specs.map(makeStrategy) as unknown as Parameters<
    typeof playGame
  >[0]['strategies'];
  const out: BankEntry[] = [];
  let n = 0;
  await playGame({
    seed: input.seed,
    dealer: input.dealer,
    strategies,
    ...(input.scores ? { scores: input.scores } : {}),
    hands: input.hands ?? 1,
    ...(input.ruleset ? { ruleset: input.ruleset } : {}),
    onDecision: ({ obs, state }) => {
      const legal = obs.legal;
      const live = obs.handSizes.reduce((a, b) => a + b, 0) + (obs.currentTrick?.plays.length ?? 0);
      const count = legal.kind === 'play' ? legal.cardIds.length : 0;
      if (legal.kind === 'play' && count < 2) return;
      if (legal.kind === 'continue' || legal.kind === 'none') return;
      const kind = legal.kind === 'bid' && legal.canCallMisdeal ? 'misdeal' : legal.kind;
      out.push({
        kind,
        live,
        legal: count,
        seed: `${input.seed}:bank:${n++}`,
        obs,
        ...(state.hand ? { hands: state.hand.hands } : {}),
      });
    },
  });
  return out;
}

export interface DecideInput {
  readonly spec: BotSpec;
  readonly entry: BankEntry;
  /** Wall-clock budget from the decision's start (ms), passed as the deadline; omit for none. */
  readonly deadlineMs?: number;
  /**
   * Score a card play against the true deal (needs `entry.hands`): solved exactly with this
   * many tricks or fewer left, otherwise `depth` tricks deep plus the greedy playout.
   */
  readonly regret?: { readonly exactTricks: number; readonly depth: number };
}

export interface DecideOutput {
  readonly ms: number;
  readonly action: Action;
  /** Best card's true value minus the chosen card's, for the seat's team ($1000s). */
  readonly regretK?: number;
}

/** One timed decision by `spec` on a banked observation. */
export async function decideTask(input: DecideInput): Promise<DecideOutput> {
  const strategy = makeStrategy(input.spec);
  if (isOracle(strategy)) throw new Error('decide: oracles need the game state');
  const { obs, hands } = input.entry;
  const rng = Rng.fromSeed(input.entry.seed);
  const started = performance.now();
  const ctx =
    input.deadlineMs !== undefined ? { deadline: Date.now() + input.deadlineMs } : undefined;
  const action = await strategy.decide(obs, rng, ctx);
  const ms = performance.now() - started;
  const r = input.regret;
  if (!r || !hands || action.type !== 'playCard' || obs.trump === null || obs.turn === null) {
    return { ms, action };
  }
  const state = buildPlayState({
    hands,
    trump: obs.trump,
    tricks: obs.tricks,
    currentTrick: obs.currentTrick,
    turn: obs.turn,
  });
  const solver = new Solver({ mode: 'linear', maxEntries: 400_000 });
  if (state.cardsInHands + state.trickCount > r.exactTricks * 4) solver.depthTricks = r.depth;
  const { moves, values } = solver.rootValues(state);
  const sign = teamOf(obs.seat) === 0 ? 1 : -1;
  const best = Math.max(...values.map((v) => sign * v));
  const chosen = values[moves.indexOf(action.cardId)];
  if (chosen === undefined) throw new Error('decide: chosen card is not legal in the true deal');
  return { ms, action, regretK: best - sign * chosen };
}
