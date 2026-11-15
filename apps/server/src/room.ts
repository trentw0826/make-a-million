import { createBot, fallbackAction } from '@mam/bots';
import {
  type Action,
  applyAction,
  createGame,
  type GameEvent,
  type GameState,
  legalMoves,
  observe,
  Rng,
  SEATS,
  type Seat,
  tableView,
} from '@mam/engine';
import type {
  Difficulty,
  ErrorCode,
  RoomPhase,
  RoomView,
  SeatView,
  ServerMessage,
} from '@mam/protocol';
import type { ServerConfig } from './config';
import { newGameSeed } from './ids';
import type { Logger } from './log';

export interface RoomError {
  readonly code: ErrorCode;
  readonly message: string;
}

export interface RoomDeps {
  readonly config: ServerConfig;
  readonly log: Logger;
  send(playerId: string, message: ServerMessage): void;
  onClosed(room: Room): void;
}

interface Member {
  readonly id: string;
  name: string;
  connected: boolean;
  readonly joinedAt: number;
  graceTimer: NodeJS.Timeout | null;
}

type HumanSeat = { readonly kind: 'human'; readonly playerId: string; botControlled: boolean };
type BotSeat = { readonly kind: 'bot'; readonly difficulty: Difficulty; readonly name: string };
export type SeatState = HumanSeat | BotSeat | null;

function err(code: ErrorCode, message: string): RoomError {
  return { code, message };
}

/**
 * One table: its members, seats, the game in progress, and the timers that implement
 * docs/multiplayer.md (grace period, bot takeover, room expiry). All game rules go through
 * the engine; this class only decides who may act and relays views.
 */
export class Room {
  phase: RoomPhase = 'lobby';
  hostId: string | null = null;
  readonly seats: [SeatState, SeatState, SeatState, SeatState] = [null, null, null, null];
  readonly members = new Map<string, Member>();
  game: GameState | null = null;

  private gamesStarted = 0;
  private botRng = Rng.fromSeed('room');
  private readonly botTimers = new Map<Seat, NodeJS.Timeout>();
  private idleTimer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    readonly code: string,
    private readonly deps: RoomDeps,
  ) {}

  // ---------------------------------------------------------------------------
  // Membership and connections

  join(playerId: string, name: string): RoomError | null {
    if (this.closed) return err('ROOM_NOT_FOUND', 'this room has closed');
    const existing = this.members.get(playerId);
    if (existing) {
      existing.name = name;
      this.reconnect(playerId);
      return null;
    }
    if (this.phase !== 'lobby') return err('GAME_IN_PROGRESS', 'a game is in progress');
    this.members.set(playerId, {
      id: playerId,
      name,
      connected: true,
      joinedAt: Date.now(),
      graceTimer: null,
    });
    if (this.hostId === null) this.hostId = playerId;
    this.clearIdleTimer();
    this.broadcastRoom();
    return null;
  }

  /** A member's connection came back: cancel the grace period and resume their seat. */
  reconnect(playerId: string): void {
    const member = this.members.get(playerId);
    if (!member) return;
    member.connected = true;
    this.clearGrace(member);
    const seat = this.seatOf(playerId);
    if (seat !== null) {
      const state = this.seats[seat];
      if (state?.kind === 'human' && state.botControlled) {
        state.botControlled = false;
        const timer = this.botTimers.get(seat);
        if (timer) {
          clearTimeout(timer);
          this.botTimers.delete(seat);
        }
      }
    }
    this.clearIdleTimer();
    this.broadcastRoom();
    this.sendView(playerId);
  }

  /** A member's connection dropped: start the grace period. */
  disconnect(playerId: string): void {
    const member = this.members.get(playerId);
    if (!member?.connected) return;
    member.connected = false;
    this.clearGrace(member);
    member.graceTimer = setTimeout(() => this.graceExpired(playerId), this.deps.config.graceMs);
    this.broadcastRoom();
    this.checkIdle();
  }

  /** A member deliberately leaves. During a game their seat is handed to a bot at once. */
  leave(playerId: string): void {
    const member = this.members.get(playerId);
    if (!member) return;
    if (this.phase === 'lobby') {
      this.removeMember(member, 'left');
      return;
    }
    member.connected = false;
    this.clearGrace(member);
    this.deps.send(playerId, { type: 'left', reason: 'left' });
    this.takeOver(playerId);
  }

  private graceExpired(playerId: string): void {
    const member = this.members.get(playerId);
    if (!member || member.connected) return;
    member.graceTimer = null;
    if (this.phase === 'lobby') {
      this.removeMember(member, 'kicked');
    } else {
      this.takeOver(playerId);
    }
  }

  /** A bot plays the seat until its owner returns. */
  private takeOver(playerId: string): void {
    const seat = this.seatOf(playerId);
    if (seat !== null) {
      const state = this.seats[seat];
      if (state?.kind === 'human') state.botControlled = true;
    }
    this.transferHostIfNeeded();
    this.broadcastRoom();
    this.scheduleBots();
    this.checkIdle();
  }

  private removeMember(member: Member, reason: 'left' | 'kicked'): void {
    this.clearGrace(member);
    const seat = this.seatOf(member.id);
    if (seat !== null) this.seats[seat] = null;
    this.members.delete(member.id);
    if (member.connected) this.deps.send(member.id, { type: 'left', reason });
    if (this.members.size === 0) {
      this.close();
      return;
    }
    this.transferHostIfNeeded();
    this.broadcastRoom();
    this.checkIdle();
  }

  private transferHostIfNeeded(): void {
    const host = this.hostId ? this.members.get(this.hostId) : undefined;
    if (host?.connected) return;
    const candidates = [...this.members.values()]
      .filter((m) => m.connected)
      .sort((a, b) => a.joinedAt - b.joinedAt);
    const next = candidates[0];
    if (next) this.hostId = next.id;
  }

  // ---------------------------------------------------------------------------
  // Lobby

  sit(playerId: string, seat: Seat): RoomError | null {
    if (!this.members.has(playerId)) return err('NOT_IN_ROOM', 'you are not in this room');
    if (this.phase !== 'lobby') return err('GAME_IN_PROGRESS', 'seats are locked during a game');
    if (this.seats[seat] !== null) return err('SEAT_TAKEN', 'that seat is taken');
    const current = this.seatOf(playerId);
    if (current !== null) this.seats[current] = null;
    this.seats[seat] = { kind: 'human', playerId, botControlled: false };
    this.broadcastRoom();
    return null;
  }

  stand(playerId: string): RoomError | null {
    if (!this.members.has(playerId)) return err('NOT_IN_ROOM', 'you are not in this room');
    if (this.phase !== 'lobby') return err('GAME_IN_PROGRESS', 'seats are locked during a game');
    const current = this.seatOf(playerId);
    if (current === null) return err('NOT_SEATED', 'you are not seated');
    this.seats[current] = null;
    this.broadcastRoom();
    return null;
  }

  addBot(playerId: string, seat: Seat, difficulty: Difficulty): RoomError | null {
    const denied = this.requireHostInLobby(playerId);
    if (denied) return denied;
    if (this.seats[seat] !== null) return err('SEAT_TAKEN', 'that seat is taken');
    this.seats[seat] = { kind: 'bot', difficulty, name: `Bot ${seat + 1}` };
    this.broadcastRoom();
    return null;
  }

  removeBot(playerId: string, seat: Seat): RoomError | null {
    const denied = this.requireHostInLobby(playerId);
    if (denied) return denied;
    if (this.seats[seat]?.kind !== 'bot') return err('NOT_SEATED', 'no bot in that seat');
    this.seats[seat] = null;
    this.broadcastRoom();
    return null;
  }

  start(playerId: string): RoomError | null {
    const denied = this.requireHostInLobby(playerId);
    if (denied) return denied;
    if (this.seats.some((s) => s === null))
      return err('ROOM_NOT_READY', 'all four seats must be filled');
    if (!this.seats.some((s) => s?.kind === 'human')) {
      return err('ROOM_NOT_READY', 'at least one seat must be a human');
    }
    // Members without a seat cannot watch (no spectators): they are sent out of the room.
    for (const member of [...this.members.values()]) {
      if (this.seatOf(member.id) === null) this.removeMember(member, 'kicked');
    }
    this.startGame();
    return null;
  }

  playAgain(playerId: string): RoomError | null {
    if (!this.members.has(playerId)) return err('NOT_IN_ROOM', 'you are not in this room');
    if (playerId !== this.hostId) return err('NOT_HOST', 'only the host can start a new game');
    if (this.phase !== 'finished') return err('GAME_IN_PROGRESS', 'the game has not finished');
    this.startGame();
    return null;
  }

  private requireHostInLobby(playerId: string): RoomError | null {
    if (!this.members.has(playerId)) return err('NOT_IN_ROOM', 'you are not in this room');
    if (playerId !== this.hostId) return err('NOT_HOST', 'only the host can do that');
    if (this.phase !== 'lobby') return err('GAME_IN_PROGRESS', 'a game is in progress');
    return null;
  }

  private startGame(): void {
    const seed = newGameSeed();
    this.gamesStarted += 1;
    this.botRng = Rng.fromSeed(`${seed}:bots`);
    this.game = createGame({
      seed,
      ruleset: this.deps.config.ruleset,
      dealer: ((this.gamesStarted - 1) % 4) as Seat,
    });
    this.phase = 'playing';
    this.deps.log('info', 'game started', { room: this.code, seed, game: this.gamesStarted });
    this.broadcastRoom();
    this.afterGameChange([
      { type: 'handStarted', handNumber: 1, dealer: this.game.dealer, redeals: 0 },
    ]);
  }

  // ---------------------------------------------------------------------------
  // Play

  /** A human's action. Returns the engine's rule error when the action is illegal. */
  action(playerId: string, action: Action): RoomError | null {
    if (!this.members.has(playerId)) return err('NOT_IN_ROOM', 'you are not in this room');
    const seat = this.seatOf(playerId);
    if (seat === null) return err('NOT_SEATED', 'you are not seated');
    if (this.phase !== 'playing' || !this.game)
      return err('GAME_IN_PROGRESS', 'no game is in progress');
    const result = applyAction(this.game, seat, action);
    if (!result.ok) {
      // Re-send the view so a confused client gets back in step.
      this.sendView(playerId);
      return { code: 'ILLEGAL_ACTION', message: result.error.message };
    }
    this.game = result.state;
    this.afterGameChange(result.events);
    return null;
  }

  private afterGameChange(events: readonly GameEvent[]): void {
    this.sendViews();
    if (events.length > 0) this.broadcast({ type: 'events', events });
    if (this.game?.phase === 'game-over') {
      this.phase = 'finished';
      this.clearBotTimers();
      this.deps.log('info', 'game over', { room: this.code, scores: this.game.scores });
      this.broadcastRoom();
      return;
    }
    this.scheduleBots();
  }

  // ---------------------------------------------------------------------------
  // Bots

  isBotControlled(seat: Seat): boolean {
    const state = this.seats[seat];
    return state !== null && (state.kind === 'bot' || state.botControlled);
  }

  private botDifficulty(seat: Seat): Difficulty {
    const state = this.seats[seat];
    return state?.kind === 'bot' ? state.difficulty : this.deps.config.takeoverDifficulty;
  }

  private scheduleBots(): void {
    this.clearBotTimers();
    const game = this.game;
    if (!game || this.phase !== 'playing' || game.phase === 'game-over') return;

    if (game.hand?.phase === 'hand-complete') {
      // Humans advance past the hand result; bots only when no human is there to do it.
      if (this.anyConnectedHumanSeated()) return;
      const seat = SEATS.find((s) => this.isBotControlled(s));
      if (seat !== undefined) this.scheduleBot(seat, this.deps.config.botContinueDelayMs);
      return;
    }

    for (const seat of SEATS) {
      if (!this.isBotControlled(seat)) continue;
      if (legalMoves(game, seat).kind === 'none') continue;
      this.scheduleBot(seat, this.deps.config.botDelayMs[this.botDifficulty(seat)]);
    }
  }

  private scheduleBot(seat: Seat, delay: number): void {
    this.botTimers.set(
      seat,
      setTimeout(() => {
        this.botTimers.delete(seat);
        void this.botAct(seat);
      }, delay),
    );
  }

  private async botAct(seat: Seat): Promise<void> {
    const game = this.game;
    if (!game || this.closed || this.phase !== 'playing' || !this.isBotControlled(seat)) return;
    const obs = observe(game, seat);
    if (obs.legal.kind === 'none') return;

    const difficulty = this.botDifficulty(seat);
    let action: Action | null = null;
    try {
      action = await createBot(difficulty).decide(obs, this.botRng);
    } catch (e) {
      this.deps.log('error', 'bot threw', { room: this.code, seat, difficulty, error: String(e) });
    }
    // The game may have moved on while the bot was deciding.
    if (this.game !== game || this.closed) return;

    let result = action ? applyAction(game, seat, action) : null;
    if (!result?.ok) {
      this.deps.log('error', 'bot chose an illegal action; using fallback', {
        room: this.code,
        seat,
        difficulty,
        action,
        error: result && !result.ok ? result.error.code : 'none',
      });
      const fallback = fallbackAction(obs);
      result = fallback ? applyAction(game, seat, fallback) : null;
      if (!result?.ok) {
        this.deps.log('error', 'fallback action also illegal; game stalled', {
          room: this.code,
          seat,
        });
        return;
      }
    }
    this.game = result.state;
    this.afterGameChange(result.events);
  }

  private clearBotTimers(): void {
    for (const timer of this.botTimers.values()) clearTimeout(timer);
    this.botTimers.clear();
  }

  // ---------------------------------------------------------------------------
  // Lifetime

  private checkIdle(): void {
    const anyone = [...this.members.values()].some((m) => m.connected);
    if (anyone) {
      this.clearIdleTimer();
    } else if (!this.idleTimer) {
      this.idleTimer = setTimeout(() => this.close(), this.deps.config.roomIdleMs);
    }
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private clearGrace(member: Member): void {
    if (member.graceTimer) {
      clearTimeout(member.graceTimer);
      member.graceTimer = null;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearBotTimers();
    this.clearIdleTimer();
    for (const member of this.members.values()) {
      this.clearGrace(member);
      if (member.connected) this.deps.send(member.id, { type: 'left', reason: 'closed' });
    }
    this.deps.log('info', 'room closed', { room: this.code });
    this.deps.onClosed(this);
  }

  get isClosed(): boolean {
    return this.closed;
  }

  // ---------------------------------------------------------------------------
  // Views

  seatOf(playerId: string): Seat | null {
    for (const seat of SEATS) {
      const state = this.seats[seat];
      if (state?.kind === 'human' && state.playerId === playerId) return seat;
    }
    return null;
  }

  private anyConnectedHumanSeated(): boolean {
    return SEATS.some((seat) => {
      const state = this.seats[seat];
      return state?.kind === 'human' && this.members.get(state.playerId)?.connected === true;
    });
  }

  view(forPlayerId: string): RoomView {
    const seats = this.seats.map((state): SeatView => {
      if (state === null) return null;
      if (state.kind === 'bot')
        return { kind: 'bot', name: state.name, difficulty: state.difficulty };
      const member = this.members.get(state.playerId);
      return {
        kind: 'human',
        playerId: state.playerId,
        name: member?.name ?? 'Player',
        connected: member?.connected ?? false,
        botControlled: state.botControlled,
      };
    }) as [SeatView, SeatView, SeatView, SeatView];
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      seats,
      yourSeat: this.seatOf(forPlayerId),
    };
  }

  private broadcastRoom(): void {
    for (const member of this.members.values()) {
      if (member.connected) this.deps.send(member.id, { type: 'room', room: this.view(member.id) });
    }
  }

  private broadcast(message: ServerMessage): void {
    for (const member of this.members.values()) {
      if (member.connected) this.deps.send(member.id, message);
    }
  }

  private sendViews(): void {
    for (const member of this.members.values()) {
      if (member.connected) this.sendView(member.id);
    }
  }

  /** Only the table view ever leaves the process for a human (see docs/architecture.md). */
  private sendView(playerId: string): void {
    const seat = this.seatOf(playerId);
    if (!this.game || seat === null) return;
    this.deps.send(playerId, { type: 'view', view: tableView(observe(this.game, seat)) });
  }
}
