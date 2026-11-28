import { type Analysis, fallbackAction, reviewMove } from '@mam/bots';
import {
  type Action,
  applyAction,
  createGame,
  type GameEvent,
  type GameState,
  legalMoves,
  observe,
  type RecordedAction,
  Rng,
  replay,
  SEATS,
  type Seat,
  tableView,
} from '@mam/engine';
import type {
  AnalysisMode,
  Difficulty,
  ErrorCode,
  ReviewedMove,
  RoomPhase,
  RoomView,
  SeatView,
  ServerMessage,
} from '@mam/protocol';
import type { AnalyzeSeat, DecideBot } from './botPool';
import { replyMs, type ServerConfig } from './config';
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
  /** Computes a solo analysis of one seat's observation. */
  analyze: AnalyzeSeat;
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
export type SeatState = HumanSeat | BotSeat;

function defaultBot(seat: Seat): BotSeat {
  return { kind: 'bot', difficulty: 'normal', name: `Bot ${seat + 1}` };
}

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
  /** Every chair starts with a Normal bot; a human sitting down takes its place. */
  readonly seats: [SeatState, SeatState, SeatState, SeatState] = [
    defaultBot(0),
    defaultBot(1),
    defaultBot(2),
    defaultBot(3),
  ];
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

  /** Solo only: how much of the analysis is shown. */
  analysis: AnalysisMode = 'off';
  /**
   * The current game as a record (seed, dealer and every action applied), so that a solo
   * game can be rebuilt by the engine at any earlier point.
   */
  private record: { seed: string; dealer: Seat; actions: RecordedAction[] } | null = null;
  /** Solo: the actions taken back, oldest first, ready to be replayed. */
  private redoLine: RecordedAction[] = [];
  /** What the players were last told about undo and redo, to re-send the room on a change. */
  private undoFlags = '';
  /** Solo analysis of the player's position, by ply (the record's length), this game only. */
  private analyses = new Map<number, { game: GameState; result: Promise<Analysis | null> }>();
  /** Plies whose move review is still to be sent; their analyses are kept until it is. */
  private reviewing = new Set<number>();
  /** Every move review sent this game, for the game review once it is over. */
  readonly reviews: ReviewedMove[] = [];

  constructor(
    readonly code: string,
    private readonly deps: RoomDeps,
    /** A private room for one player: no joining, no takeover, no hand-result clock. */
    readonly solo = false,
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
    // A solo room has its one player; to anyone else its code leads nowhere.
    if (this.solo && this.members.size > 0) return err('ROOM_NOT_FOUND', 'no room with that code');
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
    // A solo game waits for its player; the room's idle timer still closes it in the end.
    if (this.solo) return;
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
    if (seat !== null) this.seats[seat] = defaultBot(seat);
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

  /** Takes any chair not held by a human; the bot there makes way, and your old chair gets one. */
  sit(playerId: string, seat: Seat): RoomError | null {
    if (!this.members.has(playerId)) return err('NOT_IN_ROOM', 'you are not in this room');
    if (this.phase !== 'lobby') return err('GAME_IN_PROGRESS', 'seats are locked during a game');
    if (this.seats[seat]?.kind === 'human') return err('SEAT_TAKEN', 'that seat is taken');
    const current = this.seatOf(playerId);
    if (current !== null) this.seats[current] = defaultBot(current);
    this.seats[seat] = { kind: 'human', playerId, botControlled: false };
    this.broadcastRoom();
    return null;
  }

  stand(playerId: string): RoomError | null {
    if (!this.members.has(playerId)) return err('NOT_IN_ROOM', 'you are not in this room');
    if (this.phase !== 'lobby') return err('GAME_IN_PROGRESS', 'seats are locked during a game');
    const current = this.seatOf(playerId);
    if (current === null) return err('NOT_SEATED', 'you are not seated');
    this.seats[current] = defaultBot(current);
    this.broadcastRoom();
    return null;
  }

  /** The host sets the strength of the bot in a chair. */
  setBot(playerId: string, seat: Seat, difficulty: Difficulty): RoomError | null {
    const denied = this.requireHostInLobby(playerId);
    if (denied) return denied;
    if (this.seats[seat]?.kind !== 'bot') return err('SEAT_TAKEN', 'a player sits there');
    this.seats[seat] = { kind: 'bot', difficulty, name: `Bot ${seat + 1}` };
    this.broadcastRoom();
    return null;
  }

  start(playerId: string): RoomError | null {
    const denied = this.requireHostInLobby(playerId);
    if (denied) return denied;
    if (!this.seats.some((s) => s.kind === 'human')) {
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

  /** Solo only: chooses how much of the analysis to show, at any point. */
  setAnalysis(playerId: string, mode: AnalysisMode): RoomError | null {
    if (!this.members.has(playerId)) return err('NOT_IN_ROOM', 'you are not in this room');
    if (!this.solo) return err('NOT_SOLO', 'analysis is only offered in solo games');
    this.analysis = mode;
    this.broadcastRoom();
    this.sendAnalysis();
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
    const dealer = ((this.gamesStarted - 1) % 4) as Seat;
    this.game = createGame({ seed, ruleset: this.deps.config.ruleset, dealer });
    this.record = { seed, dealer, actions: [] };
    this.redoLine = [];
    this.analyses.clear();
    this.reviewing.clear();
    this.reviews.length = 0;
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
    const before = this.game;
    const result = applyAction(this.game, seat, action);
    if (!result.ok) {
      // Re-send the view so a confused client gets back in step.
      this.sendView(playerId);
      return { code: 'ILLEGAL_ACTION', message: result.error.message };
    }
    this.game = result.state;
    const ply = this.record?.actions.length ?? 0;
    const recorded = { seat, action };
    this.record?.actions.push(recorded);
    if (this.solo && this.analysis !== 'off' && action.type !== 'continue') {
      this.review(playerId, ply, before, recorded);
    }
    // A new decision of yours starts a new line: the one taken back is gone.
    if (action.type !== 'continue') this.redoLine = [];
    this.afterGameChange(result.events);
    return null;
  }

  // ---------------------------------------------------------------------------
  // Undo and redo (solo)

  /** The seat of a solo room's player (Seat 1 unless they moved in the lobby). */
  private soloSeat(playerId: string): Seat | null {
    return this.solo ? this.seatOf(playerId) : null;
  }

  /** Index in the record of the player's last decision (a confirmed result is not one). */
  private lastDecision(seat: Seat): number {
    const actions = this.record?.actions ?? [];
    for (let i = actions.length - 1; i >= 0; i--) {
      const a = actions[i] as RecordedAction;
      if (a.seat === seat && a.action.type !== 'continue') return i;
    }
    return -1;
  }

  /**
   * Takes back the player's last decision and everything after it, back to the moment it
   * was theirs to make. The engine rebuilds that position from the record, and the deal is
   * seeded, so it is exactly as it was, even in an earlier hand.
   */
  undo(playerId: string): RoomError | null {
    if (!this.members.has(playerId)) return err('NOT_IN_ROOM', 'you are not in this room');
    const seat = this.soloSeat(playerId);
    if (seat === null) return err('NOT_SOLO', 'moves can only be taken back in solo games');
    const record = this.record;
    const at = this.lastDecision(seat);
    if (!record || at < 0) return err('NOTHING_TO_UNDO', 'there is no move of yours to take back');
    this.redoLine = [...record.actions.slice(at), ...this.redoLine];
    record.actions.length = at;
    // Reviews of the moves taken back go too (redo replays the moves, not their reviews).
    const kept = this.reviews.filter((r) => r.ply < at);
    this.reviews.length = 0;
    this.reviews.push(...kept);
    this.rebuild('undo');
    return null;
  }

  /**
   * Replays the decision last taken back and what followed it, up to the player's next
   * decision, so the bots play exactly the line that was undone.
   */
  redo(playerId: string): RoomError | null {
    if (!this.members.has(playerId)) return err('NOT_IN_ROOM', 'you are not in this room');
    const seat = this.soloSeat(playerId);
    if (seat === null) return err('NOT_SOLO', 'moves can only be replayed in solo games');
    const record = this.record;
    if (!record || this.redoLine.length === 0) {
      return err('NOTHING_TO_UNDO', 'there is no move to replay');
    }
    let take = 1;
    while (take < this.redoLine.length) {
      const next = this.redoLine[take] as RecordedAction;
      if (next.seat === seat && next.action.type !== 'continue') break;
      take += 1;
    }
    record.actions.push(...this.redoLine.splice(0, take));
    this.rebuild('redo');
    return null;
  }

  /** Rebuilds the game from the record and puts every seat back in step with it. */
  private rebuild(by: 'undo' | 'redo'): void {
    const record = this.record;
    if (!record) return;
    this.clearBotTimers();
    this.clearResultTimer();
    this.game = replay({
      seed: record.seed,
      ruleset: this.deps.config.ruleset,
      dealer: record.dealer,
      actions: record.actions,
    }).state;
    this.phase = this.game.phase === 'game-over' ? 'finished' : 'playing';
    this.broadcast({ type: 'rewound', by });
    this.afterGameChange([]);
    // Undo and redo always change what can be undone, so the room is re-sent regardless.
    this.broadcastRoom();
  }

  // ---------------------------------------------------------------------------
  // Solo analysis

  /**
   * The analysis of the player's position at `ply` (once per position), computed from their
   * seat's observation alone, on its own random source. Null when it fails.
   */
  private analysisAt(ply: number, game: GameState, seat: Seat): Promise<Analysis | null> {
    const cached = this.analyses.get(ply);
    if (cached && cached.game === game) return cached.result;
    const seed = this.analysisSeed(ply);
    const result = this.deps
      .analyze(observe(game, seat), seed, Date.now() + this.deps.config.analysisMs)
      .catch((e: unknown) => {
        this.deps.log('error', 'analysis failed', { room: this.code, error: String(e) });
        return null;
      });
    this.analyses.set(ply, { game, result });
    return result;
  }

  /**
   * The analysis's own random source for the position at `ply`: apart from the bots', so
   * turning it on never changes what they play, and fixed by the position, so a position met
   * again (after an undo) is valued exactly as before.
   */
  private analysisSeed(ply: number, purpose = 'position'): number {
    return Rng.fromSeed(
      `${this.record?.seed ?? this.code}:analysis:${ply}:${purpose}`,
    ).nextUint32();
  }

  /**
   * Analyses the position just sent to the player. With hints on, sends it once it is ready;
   * with feedback only, keeps it for the review of the player's coming decision.
   */
  private sendAnalysis(): void {
    const game = this.game;
    const member = [...this.members.values()][0];
    const seat = member ? this.seatOf(member.id) : null;
    if (!this.solo || this.analysis === 'off' || !game || !member?.connected || seat === null) {
      return;
    }
    // Feedback alone needs only the positions where the player has a decision to grade.
    const deciding = (kind: string) => kind !== 'none' && kind !== 'continue';
    if (this.analysis === 'feedback' && !deciding(legalMoves(game, seat).kind)) return;
    const ply = this.record?.actions.length ?? 0;
    // Positions gone by are dropped, except those whose review is still to come.
    for (const key of this.analyses.keys()) {
      if (key !== ply && !this.reviewing.has(key)) this.analyses.delete(key);
    }
    void this.analysisAt(ply, game, seat).then((a) => {
      // Sent only while the table still shows that position: a later view makes it stale.
      if (!a || this.game !== game || this.closed || this.analysis !== 'hints') return;
      this.deps.send(member.id, {
        type: 'analysis',
        ply,
        winChance: a.winChance,
        decision: a.decision,
      });
    });
  }

  /**
   * Grades the decision the player made at `ply` against its analysis (computed now, if the
   * player was quicker than the analysis), and sends the review even if the game has moved
   * on, unless the move has been taken back.
   */
  private review(playerId: string, ply: number, before: GameState, recorded: RecordedAction): void {
    const { seat, action } = recorded;
    const hand = before.hand?.handNumber ?? 0;
    this.reviewing.add(ply);
    const stillPlayed = () =>
      !this.closed && this.analysis !== 'off' && this.record?.actions[ply] === recorded;
    void this.analysisAt(ply, before, seat)
      .then(async (a) => {
        if (!a?.decision || !stillPlayed()) return null;
        const graded = reviewMove(a.decision, action);
        if (graded || action.type !== 'discard') return graded;
        // A discard the list left out: value it alongside the listed ones.
        const again = await this.deps
          .analyze(
            observe(before, seat),
            this.analysisSeed(ply, 'include'),
            Date.now() + this.deps.config.analysisMs,
            action.cardIds,
          )
          .catch(() => null);
        return again?.decision ? reviewMove(again.decision, action) : null;
      })
      .then((graded) => {
        this.reviewing.delete(ply);
        if (!graded || !stillPlayed()) return;
        const trick = action.type === 'playCard' ? (before.hand?.tricks.length ?? 0) + 1 : null;
        this.reviews.push({ ply, hand, trick, played: action, ...graded });
        this.deps.send(playerId, { type: 'moveReview', ply, ...graded });
        // The last move's review can land after the game is over: re-send the game review.
        if (this.phase === 'finished') this.broadcastRoom();
      });
  }

  private afterGameChange(events: readonly GameEvent[]): void {
    this.syncResultTimer();
    this.sendViews();
    this.syncUndoFlags();
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
          ? replyMs(this.deps.config, this.botDifficulty(seat), 'continue')
          : this.deps.config.botContinueDelayMs;
        this.scheduleBot(seat, delay);
      }
      return;
    }

    for (const seat of SEATS) {
      if (!this.isBotControlled(seat)) continue;
      const kind = legalMoves(game, seat).kind;
      if (kind === 'none') continue;
      // By the kind of decision only, which the whole table can see.
      this.scheduleBot(seat, replyMs(this.deps.config, this.botDifficulty(seat), kind));
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

    let applied = action;
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
      applied = fallback;
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
    if (applied) this.record?.actions.push({ seat, action: applied });
    this.afterGameChange(result.events);
  }

  // ---------------------------------------------------------------------------
  // Hand result

  /** Starts the countdown when a hand result goes up, and stops it once the result is gone. */
  private syncResultTimer(): void {
    // Solo: the result waits for its one player, however long they study it.
    const showing = !this.solo && this.phase === 'playing' && this.game?.phase === 'hand-complete';
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
      this.record?.actions.push({ seat, action: { type: 'continue' } });
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
      solo: this.solo,
      analysis: this.analysis,
      ...this.undoState(forPlayerId),
      gameReview: this.gameReview(),
    };
  }

  /** Solo, once the game is over: the player's graded decisions, in the order made. */
  private gameReview(): ReviewedMove[] | null {
    if (!this.solo || this.phase !== 'finished') return null;
    return [...this.reviews].sort((a, b) => a.ply - b.ply);
  }

  private undoState(playerId: string): { canUndo: boolean; canRedo: boolean } {
    const seat = this.soloSeat(playerId);
    if (seat === null || this.phase === 'lobby') return { canUndo: false, canRedo: false };
    return { canUndo: this.lastDecision(seat) >= 0, canRedo: this.redoLine.length > 0 };
  }

  /** Re-sends the room when what can be undone or redone has changed. */
  private syncUndoFlags(): void {
    if (!this.solo) return;
    const flags = [...this.members.keys()].map((id) => JSON.stringify(this.undoState(id))).join();
    if (flags === this.undoFlags) return;
    this.undoFlags = flags;
    this.broadcastRoom();
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
    // Every view the solo player is sent is followed by its analysis, when that is on.
    if (this.solo) this.sendAnalysis();
  }
}
