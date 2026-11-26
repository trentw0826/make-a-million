import type { Action, GameEvent, Seat, TableView } from '@mam/engine';
import { SUITS } from '@mam/engine';
import { z } from 'zod';

export const PROTOCOL_VERSION = 1;

/** Players connect to this path on the same origin that serves the client. */
export const WS_PATH = '/ws';

// ---------------------------------------------------------------------------
// Primitive schemas

export const SeatSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export const CardIdSchema = z.number().int().min(0).max(54);
export const SuitSchema = z.enum(SUITS);
/**
 * The bot levels a table can choose. `@mam/bots` also has an `expert` strategy, kept out of
 * play until its decisions fit their reply time (docs/bot-roadmap.md).
 */
export const DifficultySchema = z.enum(['easy', 'normal', 'hard', 'expert']);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const PlayerNameSchema = z
  .string()
  .trim()
  .min(1, 'name is required')
  .max(20, 'name is too long');

export const RoomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/, 'room codes are six letters or digits');

/** Mirrors the engine's Action type; the engine still validates legality. */
export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('callMisdeal') }),
  z.object({ type: z.literal('bid'), amount: z.number().int().nonnegative() }),
  z.object({ type: z.literal('pass') }),
  z.object({ type: z.literal('discard'), cardIds: z.array(CardIdSchema).length(3).readonly() }),
  z.object({ type: z.literal('nameTrump'), suit: SuitSchema }),
  z.object({ type: z.literal('playCard'), cardId: CardIdSchema }),
  z.object({ type: z.literal('continue') }),
]);

// ---------------------------------------------------------------------------
// Client → server

/**
 * How much of the solo analysis the player sees: nothing; hints before each decision (the
 * win-chance bar and the value of each choice) as well as a review after it; or only the
 * review after each decision.
 */
export const AnalysisModeSchema = z.enum(['off', 'hints', 'feedback']);
export type AnalysisMode = z.infer<typeof AnalysisModeSchema>;

export const ClientMessageSchema = z.discriminatedUnion('type', [
  /** First message on every connection. A token reclaims an existing identity. */
  z.object({ type: z.literal('hello'), name: PlayerNameSchema, token: z.string().optional() }),
  z.object({ type: z.literal('createRoom') }),
  /** A private room for one player and three bots (see "Solo rooms" in docs/multiplayer.md). */
  z.object({ type: z.literal('createSolo') }),
  z.object({ type: z.literal('joinRoom'), code: RoomCodeSchema }),
  z.object({ type: z.literal('leaveRoom') }),
  z.object({ type: z.literal('sit'), seat: SeatSchema }),
  z.object({ type: z.literal('stand') }),
  z.object({ type: z.literal('setBot'), seat: SeatSchema, difficulty: DifficultySchema }),
  z.object({ type: z.literal('startGame') }),
  z.object({ type: z.literal('playAgain') }),
  /** Solo only: take back your last decision, or replay the one last taken back. */
  z.object({ type: z.literal('undo') }),
  z.object({ type: z.literal('redo') }),
  /** Solo only: choose how much of the analysis to show (see `AnalysisMode`). */
  z.object({ type: z.literal('setAnalysis'), mode: AnalysisModeSchema }),
  z.object({ type: z.literal('action'), action: ActionSchema }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string') return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = ClientMessageSchema.safeParse(json);
  return result.success ? result.data : null;
}

// ---------------------------------------------------------------------------
// Server → client

export type RoomPhase = 'lobby' | 'playing' | 'finished';

export type SeatView =
  | null
  | {
      readonly kind: 'human';
      readonly playerId: string;
      readonly name: string;
      readonly connected: boolean;
      /** A bot is playing this seat while its owner is away. */
      readonly botControlled: boolean;
    }
  | {
      readonly kind: 'bot';
      readonly name: string;
      readonly difficulty: Difficulty;
    };

export interface RoomView {
  readonly code: string;
  readonly phase: RoomPhase;
  readonly hostId: string | null;
  readonly seats: readonly [SeatView, SeatView, SeatView, SeatView];
  /** The receiving player's own seat, if seated. */
  readonly yourSeat: Seat | null;
  /** A solo room: one player and three bots, private, with no clocks on the player. */
  readonly solo: boolean;
  /** Solo only: how much of the analysis is shown; `'off'` elsewhere. */
  readonly analysis: AnalysisMode;
  /** Solo only: there is a decision of yours to take back, or one taken back to replay. */
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /**
   * Solo only, once the game is over: every decision of yours the analysis graded, in the
   * order made (none if the analysis was off). Null elsewhere and while the game goes on.
   */
  readonly gameReview: readonly ReviewedMove[] | null;
}

/** One of your decisions in a solo game, as the analysis graded it (`RoomView.gameReview`). */
export interface ReviewedMove {
  /** How many of the game's actions came before it. */
  readonly ply: number;
  /** The hand it was made in (1 for the first). */
  readonly hand: number;
  /** For a card, the trick it was played to (1–13); null for any other decision. */
  readonly trick: number | null;
  readonly played: Action;
  readonly label: MoveLabel;
  /** Points given up against the best choice ($1000s, never negative). */
  readonly lossK: number;
  readonly best: Action;
}

export interface ResultTimer {
  readonly remainingMs: number;
  readonly totalMs: number;
}

/** Solo analysis of one of the player's decisions (see "Solo rooms" in docs/multiplayer.md). */
export interface AnalysisDecision {
  readonly kind: 'play' | 'bid' | 'discard' | 'trump';
  /**
   * The choices valued: every legal card or trump, bid (at the minimum) or pass (and call a
   * misdeal), or the best few discards.
   */
  readonly options: readonly {
    readonly action: Action;
    /** Expected score change for your side minus the opponents' this hand ($1000s). */
    readonly points: number;
    /** Your side's chance of winning the game after this choice (0–1). */
    readonly winChance: number;
  }[];
  /** Index of the option worth the most points. */
  readonly best: number;
}

/** How a move compares with the best: graded by the money it gave up. */
export type MoveLabel = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'forced';

export type ErrorCode =
  | 'BAD_MESSAGE'
  | 'NOT_IDENTIFIED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_IN_PROGRESS'
  | 'NOT_IN_ROOM'
  | 'NOT_HOST'
  | 'SEAT_TAKEN'
  | 'NOT_SEATED'
  | 'ROOM_NOT_READY'
  | 'ILLEGAL_ACTION'
  | 'NOT_SOLO'
  | 'NOTHING_TO_UNDO';

export type ServerMessage =
  | {
      readonly type: 'welcome';
      readonly playerId: string;
      readonly token: string;
      readonly name: string;
    }
  | { readonly type: 'room'; readonly room: RoomView }
  /** The player is no longer in a room (left, or the room closed). */
  | { readonly type: 'left'; readonly reason: 'left' | 'closed' | 'kicked' }
  | {
      readonly type: 'view';
      readonly view: TableView;
      /** While the hand result is up: time left before the next hand is dealt regardless. */
      readonly resultTimer?: ResultTimer;
    }
  | { readonly type: 'events'; readonly events: readonly GameEvent[] }
  /**
   * Solo: the game jumped to another point (undo or redo). The view that follows replaces
   * the table; no events explain the jump.
   */
  | { readonly type: 'rewound'; readonly by: 'undo' | 'redo' }
  /**
   * Solo, with the analysis on: the value of the position in the view last sent (and of your
   * decision there, if it is yours to make). A later view makes it stale. `ply` counts the
   * game's actions so far.
   */
  | {
      readonly type: 'analysis';
      readonly ply: number;
      readonly winChance: number;
      readonly decision: AnalysisDecision | null;
    }
  /** Solo, with the analysis on: how the decision you made at `ply` compares with the best. */
  | {
      readonly type: 'moveReview';
      readonly ply: number;
      readonly label: MoveLabel;
      readonly lossK: number;
      readonly best: Action;
    }
  | {
      readonly type: 'error';
      readonly code: ErrorCode;
      readonly message: string;
      /** Engine rule code when the error is ILLEGAL_ACTION. */
      readonly detail?: string;
    }
  | { readonly type: 'pong' };

export function encode(message: ServerMessage): string {
  return JSON.stringify(message);
}
