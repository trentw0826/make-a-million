import {
  type Action,
  applyAction,
  assertInvariants,
  createGame,
  type GameState,
  type Observation,
  observe,
  Recorder,
  Rng,
  type Ruleset,
  SEATS,
  type Seat,
} from '@mam/engine';
import { isOracle, type SimStrategy } from './strategies';

export class IllegalBotAction extends Error {
  constructor(
    readonly strategy: string,
    readonly seat: Seat,
    readonly action: Action,
    readonly code: string,
    readonly obs: Observation,
  ) {
    super(`${strategy} (seat ${seat}) chose an illegal ${action.type}: ${code}`);
    this.name = 'IllegalBotAction';
  }
}

export interface PlayGameOptions {
  readonly seed: string | number;
  readonly strategies: readonly [SimStrategy, SimStrategy, SimStrategy, SimStrategy];
  readonly ruleset?: Ruleset;
  readonly dealer?: Seat;
  /** Starting scores (default [0, 0]). */
  readonly scores?: readonly [number, number];
  /** Stop once this many hands have been scored (default: play to game over). */
  readonly hands?: number;
  /** Check engine invariants after every action (slower). */
  readonly checkInvariants?: boolean;
  readonly maxSteps?: number;
  /** Called before each decision with the acting seat; used for timing and data capture. */
  readonly onDecision?: (info: DecisionInfo) => void;
}

export interface DecisionInfo {
  readonly seat: Seat;
  /** The true state before the action (simulator diagnostics only; bots never see it). */
  readonly state: GameState;
  readonly obs: Observation;
  readonly action: Action;
  readonly ms: number;
}

export interface GameOutcome {
  readonly state: GameState;
  readonly steps: number;
  readonly recorder: Recorder;
}

/** Plays one game (or the first `hands` hands of one) with the given strategy in each seat. */
export async function playGame(options: PlayGameOptions): Promise<GameOutcome> {
  const { seed, strategies } = options;
  const maxSteps = options.maxSteps ?? 100_000;
  let state = createGame({
    seed,
    ...(options.ruleset ? { ruleset: options.ruleset } : {}),
    ...(options.dealer !== undefined ? { dealer: options.dealer } : {}),
    ...(options.scores ? { scores: options.scores } : {}),
  });
  const recorder = new Recorder(state);
  let steps = 0;

  while (state.phase !== 'game-over') {
    if (options.hands !== undefined && state.handHistory.length >= options.hands) break;
    if (steps++ > maxSteps) throw new Error(`game did not finish within ${maxSteps} steps`);
    const { seat, obs } = nextActor(state);
    const strategy = strategies[seat];
    // A fresh stream per decision, keyed by the seat and the game step: two bots reaching
    // the same position get the same randomness however much each consumed before, so
    // duplicate boards on which they decide alike play out identically (common random
    // numbers), which cuts the noise in A-versus-B comparisons.
    const rng = Rng.fromSeed(`${seed}:seat:${seat}:step:${steps}`);
    const started = performance.now();
    const action = isOracle(strategy)
      ? await strategy.decideWithState(state, seat, obs, rng)
      : await strategy.decide(obs, rng);
    options.onDecision?.({ seat, state, obs, action, ms: performance.now() - started });
    const result = applyAction(state, seat, action);
    if (!result.ok) throw new IllegalBotAction(strategy.id, seat, action, result.error.code, obs);
    recorder.record(seat, action);
    state = result.state;
    if (options.checkInvariants) assertInvariants(state);
  }
  return { state, steps, recorder };
}

function nextActor(state: GameState): { seat: Seat; obs: Observation } {
  for (const seat of SEATS) {
    const obs = observe(state, seat);
    if (obs.legal.kind !== 'none') return { seat, obs };
  }
  throw new Error(`no seat can act in phase ${state.hand?.phase ?? state.phase}`);
}
