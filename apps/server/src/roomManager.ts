import type { ServerMessage } from '@mam/protocol';
import type { DecideBot } from './botPool';
import type { ServerConfig } from './config';
import { newRoomCode } from './ids';
import type { Logger } from './log';
import { Room, type RoomError } from './room';

export interface RoomManagerDeps {
  readonly config: ServerConfig;
  readonly log: Logger;
  send(playerId: string, message: ServerMessage): void;
  readonly decideBot: DecideBot;
}

/** All live rooms, keyed by code. */
export class RoomManager {
  readonly rooms = new Map<string, Room>();

  constructor(private readonly deps: RoomManagerDeps) {}

  /** A new room with this player as host; a solo room seats them at Seat 1 at once. */
  create(playerId: string, name: string, options: { solo?: boolean } = {}): Room {
    this.leave(playerId);
    let code = newRoomCode();
    while (this.rooms.has(code)) code = newRoomCode();
    const room = new Room(
      code,
      {
        config: this.deps.config,
        log: this.deps.log,
        send: this.deps.send,
        onClosed: (closed) => this.rooms.delete(closed.code),
        decideBot: this.deps.decideBot,
      },
      options.solo === true,
    );
    this.rooms.set(code, room);
    room.join(playerId, name);
    if (room.solo) room.sit(playerId, 0);
    this.deps.log('info', 'room created', { room: code, solo: room.solo });
    return room;
  }

  join(playerId: string, name: string, code: string): RoomError | null {
    const room = this.rooms.get(code);
    if (!room) return { code: 'ROOM_NOT_FOUND', message: 'no room with that code' };
    const current = this.roomOf(playerId);
    if (current && current !== room) current.leave(playerId);
    return room.join(playerId, name);
  }

  roomOf(playerId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.members.has(playerId)) return room;
    }
    return undefined;
  }

  leave(playerId: string): void {
    this.roomOf(playerId)?.leave(playerId);
  }

  disconnect(playerId: string): void {
    this.roomOf(playerId)?.disconnect(playerId);
  }

  reconnect(playerId: string): Room | undefined {
    const room = this.roomOf(playerId);
    room?.reconnect(playerId);
    return room;
  }

  closeAll(): void {
    for (const room of [...this.rooms.values()]) room.close();
  }
}
