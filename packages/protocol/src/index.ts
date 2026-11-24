import type { GameEvent, Seat, TableView } from '@mam/engine';
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

export const ClientMessageSchema = z.discriminatedUnion('type', [
  /** First message on every connection. A token reclaims an existing identity. */
  z.object({ type: z.literal('hello'), name: PlayerNameSchema, token: z.string().optional() }),
  z.object({ type: z.literal('createRoom') }),
  z.object({ type: z.literal('joinRoom'), code: RoomCodeSchema }),
  z.object({ type: z.literal('leaveRoom') }),
  z.object({ type: z.literal('sit'), seat: SeatSchema }),
  z.object({ type: z.literal('stand') }),
  z.object({ type: z.literal('setBot'), seat: SeatSchema, difficulty: DifficultySchema }),
  z.object({ type: z.literal('startGame') }),
  z.object({ type: z.literal('playAgain') }),
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
}

export interface ResultTimer {
  readonly remainingMs: number;
  readonly totalMs: number;
}

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
  | 'ILLEGAL_ACTION';

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
