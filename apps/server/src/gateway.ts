import type { IncomingMessage } from 'node:http';
import { type ClientMessage, encode, parseClientMessage, type ServerMessage } from '@mam/protocol';
import type { WebSocket, WebSocketServer } from 'ws';
import type { Logger } from './log';
import type { RoomManager } from './roomManager';
import type { SessionStore } from './sessions';

/**
 * Translates WebSocket traffic into room operations. Each connection must identify itself
 * with `hello` first; after that every message is routed to the player's room.
 */
export class Gateway {
  private readonly sockets = new Map<string, WebSocket>();
  private manager: RoomManager | null = null;

  constructor(
    private readonly sessions: SessionStore,
    private readonly log: Logger,
  ) {}

  /** The manager is created after the gateway (it needs `send`), so it is attached here. */
  attachManager(manager: RoomManager): void {
    this.manager = manager;
  }

  attach(wss: WebSocketServer): void {
    wss.on('connection', (ws, req) => this.handleConnection(ws, req));
  }

  send(playerId: string, message: ServerMessage): void {
    const ws = this.sockets.get(playerId);
    if (ws && ws.readyState === ws.OPEN) ws.send(encode(message));
  }

  get connectionCount(): number {
    return this.sockets.size;
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    let playerId: string | null = null;
    this.log('debug', 'connection opened', { from: req.socket.remoteAddress });

    ws.on('message', (data) => {
      const message = parseClientMessage(data.toString());
      if (!message) {
        this.reply(ws, { type: 'error', code: 'BAD_MESSAGE', message: 'malformed message' });
        return;
      }
      if (message.type === 'hello') {
        playerId = this.hello(ws, message, playerId);
        return;
      }
      if (message.type === 'ping') {
        this.reply(ws, { type: 'pong' });
        return;
      }
      if (!playerId) {
        this.reply(ws, { type: 'error', code: 'NOT_IDENTIFIED', message: 'send hello first' });
        return;
      }
      this.route(playerId, message);
    });

    ws.on('close', () => {
      if (playerId && this.sockets.get(playerId) === ws) {
        this.sockets.delete(playerId);
        this.manager?.disconnect(playerId);
      }
    });

    ws.on('error', (e) => this.log('warn', 'socket error', { error: String(e) }));
  }

  private hello(
    ws: WebSocket,
    message: Extract<ClientMessage, { type: 'hello' }>,
    previous: string | null,
  ): string {
    const session = this.sessions.resolve(message.name, message.token);
    if (previous && previous !== session.playerId) this.sockets.delete(previous);

    // A second connection for the same player (another tab, or a reconnect that beat the
    // old socket's close) replaces the first.
    const old = this.sockets.get(session.playerId);
    if (old && old !== ws) {
      this.sockets.delete(session.playerId);
      old.close(4001, 'replaced by a newer connection');
    }
    this.sockets.set(session.playerId, ws);

    this.reply(ws, {
      type: 'welcome',
      playerId: session.playerId,
      token: session.token,
      name: session.name,
    });
    this.manager?.reconnect(session.playerId);
    return session.playerId;
  }

  private route(
    playerId: string,
    message: Exclude<ClientMessage, { type: 'hello' | 'ping' }>,
  ): void {
    const manager = this.manager;
    if (!manager) return;
    const name = this.nameOf(playerId);

    switch (message.type) {
      case 'createRoom':
        manager.create(playerId, name);
        return;
      case 'createSolo':
        manager.create(playerId, name, { solo: true });
        return;
      case 'joinRoom': {
        const error = manager.join(playerId, name, message.code);
        if (error) this.send(playerId, { type: 'error', ...error });
        return;
      }
      case 'leaveRoom':
        manager.leave(playerId);
        this.send(playerId, { type: 'left', reason: 'left' });
        return;
      default:
        break;
    }

    const room = manager.roomOf(playerId);
    if (!room) {
      this.send(playerId, { type: 'error', code: 'NOT_IN_ROOM', message: 'you are not in a room' });
      return;
    }

    const error = (() => {
      switch (message.type) {
        case 'sit':
          return room.sit(playerId, message.seat);
        case 'stand':
          return room.stand(playerId);
        case 'setBot':
          return room.setBot(playerId, message.seat, message.difficulty);
        case 'startGame':
          return room.start(playerId);
        case 'playAgain':
          return room.playAgain(playerId);
        case 'undo':
          return room.undo(playerId);
        case 'redo':
          return room.redo(playerId);
        case 'setAnalysis':
          return room.setAnalysis(playerId, message.mode);
        case 'action':
          return room.action(playerId, message.action);
      }
    })();
    if (error) this.send(playerId, { type: 'error', ...error });
  }

  private nameOf(playerId: string): string {
    return this.sessions.nameOf(playerId) ?? 'Player';
  }

  private reply(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(encode(message));
  }
}
