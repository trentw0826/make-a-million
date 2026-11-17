import { availableParallelism } from 'node:os';
import path from 'node:path';
import { DEFAULT_RULESET, type Ruleset } from '@mam/engine';
import type { Difficulty } from '@mam/protocol';

export interface ServerConfig {
  readonly port: number;
  /** How long a disconnected seat waits before a bot takes over. */
  readonly graceMs: number;
  /** How long a room survives with no human connected. */
  readonly roomIdleMs: number;
  /** Fixed think time per difficulty; never depends on the decision (see bot-standards). */
  readonly botDelayMs: Readonly<Record<Difficulty, number>>;
  /**
   * A searching bot's answer is due this long before its reply time, which leaves room to
   * deliver it on time; past that it stops searching and plays its best move so far.
   */
  readonly botDeadlineMarginMs: number;
  /**
   * After a trick is taken, how long the table rests before the next bot's turn begins, so
   * everyone can see the finished trick before it is gathered (the bot's own reply time
   * follows).
   */
  readonly trickPauseMs: number;
  /** Delay before a bot confirms the hand result when no human is present. */
  readonly botContinueDelayMs: number;
  /**
   * How long the hand result stays up. The next hand is dealt when every seat has
   * confirmed, or when this runs out, whichever comes first.
   */
  readonly handResultMs: number;
  /** Strategy used to play a human's seat while they are away. */
  readonly takeoverDifficulty: Difficulty;
  /** Worker threads for searching bots (Hard). 0 runs them on the main thread. */
  readonly botWorkers: number;
  /** The one global ruleset (see docs/architecture.md). */
  readonly ruleset: Ruleset;
  /** Built client to serve; ignored if the directory does not exist. */
  readonly staticDir: string;
}

const env = process.env;

export const DEFAULT_CONFIG: ServerConfig = {
  port: Number(env.PORT ?? 3000),
  graceMs: Number(env.GRACE_MS ?? 60_000),
  roomIdleMs: Number(env.ROOM_IDLE_MS ?? 10 * 60_000),
  botDelayMs: { easy: 700, normal: 900, hard: 1500 },
  botDeadlineMarginMs: 200,
  trickPauseMs: 1_500,
  botContinueDelayMs: 4_000,
  handResultMs: 20_000,
  takeoverDifficulty: 'normal',
  botWorkers: Number(env.BOT_WORKERS ?? Math.max(1, Math.min(4, availableParallelism() - 1))),
  ruleset: DEFAULT_RULESET,
  staticDir: env.STATIC_DIR ?? path.resolve(import.meta.dirname, '../../client/dist'),
};

/** Settings for tests: instant bots, short timers. */
export function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    ...DEFAULT_CONFIG,
    port: 0,
    botDelayMs: { easy: 1, normal: 1, hard: 1 },
    botWorkers: 0,
    botContinueDelayMs: 1,
    trickPauseMs: 0,
    ...overrides,
  };
}
