import { type BotStrategy, createBot, isDifficulty } from '@mam/bots';
import type { Action, GameState, Observation, Rng, Seat } from '@mam/engine';

/**
 * A strategy that may see the whole game state. Only the simulator can run one: it exists
 * to measure how much a real (observation-only) bot leaves on the table. It must never be
 * reachable from createBot or the server (see "Evaluation-only oracles" in bot-standards).
 */
export interface OracleStrategy {
  readonly id: string;
  readonly needsState: true;
  decideWithState(
    state: GameState,
    seat: Seat,
    obs: Observation,
    rng: Rng,
  ): Action | Promise<Action>;
}

export type SimStrategy = BotStrategy | OracleStrategy;

export function isOracle(s: SimStrategy): s is OracleStrategy {
  return 'needsState' in s && s.needsState === true;
}

/**
 * Bots are named by a spec string so worker threads can build them:
 * "easy", "normal", "hard", "hard:samples=40,budget=200000", "oracle".
 */
export type BotSpec = string;

export interface ParsedSpec {
  readonly name: string;
  readonly options: Readonly<Record<string, string>>;
}

export function parseSpec(spec: BotSpec): ParsedSpec {
  const [name = '', rest = ''] = spec.split(':', 2);
  const options: Record<string, string> = {};
  for (const part of rest.split(',')) {
    if (!part) continue;
    const [k, v = 'true'] = part.split('=', 2);
    if (k) options[k.trim()] = v.trim();
  }
  return { name: name.trim(), options };
}

type Factory = (options: Readonly<Record<string, string>>) => SimStrategy;

const extra = new Map<string, Factory>();

/** Lets later modules (search bots, oracle) register themselves without circular imports. */
export function registerStrategy(name: string, factory: Factory): void {
  extra.set(name, factory);
}

export function makeStrategy(spec: BotSpec): SimStrategy {
  const { name, options } = parseSpec(spec);
  const factory = extra.get(name);
  if (factory) return factory(options);
  if (isDifficulty(name)) return createBot(name);
  throw new Error(`unknown bot spec "${spec}"`);
}

export function knownStrategies(): string[] {
  return ['easy', 'normal', ...extra.keys()];
}
