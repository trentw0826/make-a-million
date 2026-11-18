import { fallbackAction } from '@mam/bots';
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
import type { DecideBot } from './botPool';
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
  /** Computes a bot decision (inline or on a worker thread). */
  decideBot: DecideBot;
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
  private botGeneration = 0;
  private readonly botTimers = new Map<Seat, NodeJS.Timeout>();
  /** The rest after a trick is taken, before the bots' next turn begins. */
  private trickPause: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  /** The hand result's countdown; when it runs out every seat still reading is confirmed. */
  private result: { timer: NodeJS.Timeout; endsAt: number } | null = null;
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

  /**
   * A member deliberately leaves. During a game their seat is handed to a bot at once, unless
   * they were the last human still at the table (every other human seat is already played by
   * a bot): then the game would be bots alone, so the room closes.
   */
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
    const othersAtTable = this.seats.some(
      (s) => s?.kind === 'human' && s.playerId !== playerId && !s.botControlled,
    );
    if (!othersAtTable) {
      this.deps.log('info', 'last human left; closing the room', { room: this.code });
      this.close();
      return;
    }
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
    this.syncResultTimer();
    this.sendViews();
    if (events.length > 0) this.broadcast({ type: 'events', events });
    if (this.game?.phase === 'game-over') {
      this.phase = 'finished';
      this.clearBotTimers();
      this.deps.log('info', 'game over', { room: this.code, scores: this.game.scores });
      this.broadcastRoom();
      return;
    }
    // The table rests after a trick so it can be seen before it is gathered.
    const trickTaken = events.some((e) => e.type === 'trickWon');
    this.scheduleBots(trickTaken ? this.deps.config.trickPauseMs : 0);
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

  /**
   * Starts the clock for every bot that has a decision to make. With a `pause`, their turns
   * begin only once it has passed; each bot's own reply time then follows as usual, so the
   * pause never changes how long a bot thinks.
   */
  private scheduleBots(pause = 0): void {
    this.clearBotTimers();
    const game = this.game;
    if (!game || this.phase !== 'playing' || game.phase === 'game-over') return;

    if (pause > 0 && game.hand?.phase !== 'hand-complete') {
      this.trickPause = setTimeout(() => {
        this.trickPause = null;
        this.scheduleBots();
      }, pause);
      return;
    }

    if (game.hand?.phase === 'hand-complete') {
      // Bots confirm the result at their usual pace, or slowly when no human is watching.
      const watched = this.anyConnectedHumanSeated();
      for (const seat of game.hand.continuePending) {
        if (!this.isBotControlled(seat)) continue;
        const delay = watched
          ? this.deps.config.botDelayMs[this.botDifficulty(seat)]
          : this.deps.config.botContinueDelayMs;
        this.scheduleBot(seat, delay);
      }
      return;
    }

    for (const seat of SEATS) {
      if (!this.isBotControlled(seat)) continue;
      if (legalMoves(game, seat).kind === 'none') continue;
      this.scheduleBot(seat, this.deps.config.botDelayMs[this.botDifficulty(seat)]);
    }
  }

  /**
   * Starts the bot's decision at once and plays it exactly `delay` ms after it became the
   * bot's turn (or as soon as it is ready, if thinking takes longer). The reply time then
   * reveals nothing about the hand or the choice (see "Compute and Timing" in bot-standards).
   */
  private scheduleBot(seat: Seat, delay: number): void {
    const game = this.game;
    if (!game) return;
    const generation = this.botGeneration;
    const started = Date.now();
    const seed = this.botRng.nextUint32();
    const deadline = started + delay - this.deps.config.botDeadlineMarginMs;
    void this.computeBotAction(seat, game, seed, deadline).then((action) => {
      if (generation !== this.botGeneration || this.game !== game || this.closed) return;
      // The deadline is a safety net: budgets are sized so that it should almost never fire.
      const late = Date.now() - deadline;
      if (late > 0 && deadline > started) {
        this.deps.log('warn', 'bot answered after its deadline', {
          room: this.code,
          seat,
          difficulty: this.botDifficulty(seat),
          lateMs: late,
        });
      }
      const wait = Math.max(0, delay - (Date.now() - started));
      this.botTimers.set(
        seat,
        setTimeout(() => {
          this.botTimers.delete(seat);
          this.applyBotAction(seat, game, action);
        }, wait),
      );
    });
  }

  private async computeBotAction(
    seat: Seat,
    game: GameState,
    seed: number,
    deadline: number,
  ): Promise<Action | null> {
    if (this.closed || this.phase !== 'playing' || !this.isBotControlled(seat)) return null;
    const obs = observe(game, seat);
    if (obs.legal.kind === 'none') return null;
    const difficulty = this.botDifficulty(seat);
    try {
      return await this.deps.decideBot(difficulty, obs, seed, deadline);
    } catch (e) {
      this.deps.log('error', 'bot threw', { room: this.code, seat, difficulty, error: String(e) });
      return null;
    }
  }

  private applyBotAction(seat: Seat, game: GameState, action: Action | null): void {
    // The game may have moved on while the bot was deciding.
    if (this.game !== game || this.closed || !this.isBotControlled(seat)) return;
    const obs = observe(game, seat);
    if (obs.legal.kind === 'none') return;
    const difficulty = this.botDifficulty(seat);

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

  // ---------------------------------------------------------------------------
  // Hand result

  /** Starts the countdown when a hand result goes up, and stops it once the result is gone. */
  private syncResultTimer(): void {
    const showing = this.phase === 'playing' && this.game?.phase === 'hand-complete';
    if (!showing) {
      this.clearResultTimer();
    } else if (!this.result) {
      const ms = this.deps.config.handResultMs;
      this.result = { timer: setTimeout(() => this.resultExpired(), ms), endsAt: Date.now() + ms };
    }
  }

  private resultExpired(): void {
    this.result = null;
    let game = this.game;
    if (!game || this.closed || game.phase !== 'hand-complete') return;
    const events: GameEvent[] = [];
    for (const seat of game.hand?.continuePending ?? []) {
      const result = applyAction(game, seat, { type: 'continue' });
      if (!result.ok) continue;
      game = result.state;
      events.push(...result.events);
    }
    this.game = game;
    this.afterGameChange(events);
  }

  private clearResultTimer(): void {
    if (this.result) {
      clearTimeout(this.result.timer);
      this.result = null;
    }
  }

  private clearBotTimers(): void {
    for (const timer of this.botTimers.values()) clearTimeout(timer);
    this.botTimers.clear();
    if (this.trickPause) clearTimeout(this.trickPause);
    this.trickPause = null;
    // Decisions still being computed for the old position are discarded when they arrive.
    this.botGeneration += 1;
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
    this.clearResultTimer();
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
    const view = tableView(observe(this.game, seat));
    const timer = this.result
      ? {
          remainingMs: Math.max(0, this.result.endsAt - Date.now()),
          totalMs: this.deps.config.handResultMs,
        }
      : undefined;
    this.deps.send(
      playerId,
      timer ? { type: 'view', view, resultTimer: timer } : { type: 'view', view },
    );
  }
}
