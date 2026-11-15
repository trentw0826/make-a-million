import type { BotStrategy } from '@mam/bots';
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
  readonly strategies: readonly [BotStrategy, BotStrategy, BotStrategy, BotStrategy];
  readonly ruleset?: Ruleset;
  readonly dealer?: Seat;
  /** Check engine invariants after every action (slower). */
  readonly checkInvariants?: boolean;
  readonly maxSteps?: number;
}

export interface GameOutcome {
  readonly state: GameState;
  readonly steps: number;
  readonly recorder: Recorder;
}

/** Plays one game to completion with the given strategy in each seat. */
export async function playGame(options: PlayGameOptions): Promise<GameOutcome> {
  const { seed, strategies } = options;
  const maxSteps = options.maxSteps ?? 100_000;
  const rngs = SEATS.map((seat) => Rng.fromSeed(`${seed}:seat:${seat}`));
  let state = createGame({
    seed,
    ...(options.ruleset ? { ruleset: options.ruleset } : {}),
    ...(options.dealer !== undefined ? { dealer: options.dealer } : {}),
  });
  const recorder = new Recorder(state);
  let steps = 0;

  while (state.phase !== 'game-over') {
    if (steps++ > maxSteps) throw new Error(`game did not finish within ${maxSteps} steps`);
    const { seat, obs } = nextActor(state);
    const strategy = strategies[seat];
    const action = await strategy.decide(obs, rngs[seat] as Rng);
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
