import { availableParallelism } from 'node:os';
import path from 'node:path';
import { DEFAULT_RULESET, type Ruleset } from '@mam/engine';
import type { Difficulty } from '@mam/protocol';

/**
 * The kinds of decision a bot's reply time may depend on. Everyone at the table can see
 * which kind a bot faces, so timing by kind gives nothing away (docs/bot-standards.md).
 * A bid includes a misdeal call; `continue` confirms a hand result.
 */
export type ReplyKind = 'bid' | 'discard' | 'trump' | 'play' | 'continue';

/** A bot's reply time: the same for every decision, or one for each kind of decision. */
export type ReplyTime = number | Readonly<Record<ReplyKind, number>>;

export interface ServerConfig {
  readonly port: number;
  /** How long a disconnected seat waits before a bot takes over. */
  readonly graceMs: number;
  /** How long a room survives with no human connected. */
  readonly roomIdleMs: number;
  /**
   * Fixed reply time per difficulty, for Expert per kind of decision. It never depends on the
   * bot's hand or its choice (see bot-standards).
   */
  readonly botDelayMs: Readonly<Record<Difficulty, ReplyTime>>;
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
  /**
   * How long the solo analysis of one position may take. It is a deadline, as for the bots;
   * its budgets are sized to finish well inside it (docs/bot-standards.md, Analysis). It
   * searches with Expert's budgets, so it has Expert's longest deadline (a discard's or
   * trump's).
   */
  readonly analysisMs: number;
  /** Strategy used to play a human's seat while they are away. */
  readonly takeoverDifficulty: Difficulty;
  /** Worker threads for searching bots (Hard and Expert). 0 runs them on the main thread. */
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
  // Expert thinks longest over its discards and trump, and needs well under a second for
  // most bids and cards; each time is above that kind's slowest decision on the dev machine
  // (docs/bot-ladder.md, Timing).
  botDelayMs: {
    easy: 700,
    normal: 900,
    hard: 1500,
    expert: { bid: 1500, play: 2500, discard: 5000, trump: 5000, continue: 1500 },
  },
  botDeadlineMarginMs: 200,
  trickPauseMs: 1_500,
  botContinueDelayMs: 4_000,
  handResultMs: 25_000,
  analysisMs: 4_800,
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
    botDelayMs: { easy: 1, normal: 1, hard: 1, expert: 1 },
    botWorkers: 0,
    botContinueDelayMs: 1,
    trickPauseMs: 0,
    ...overrides,
  };
}

/** How long a bot at `level` takes to reply to a decision of `kind`. */
export function replyMs(config: ServerConfig, level: Difficulty, kind: ReplyKind): number {
  const time = config.botDelayMs[level];
  return typeof time === 'number' ? time : time[kind];
}
