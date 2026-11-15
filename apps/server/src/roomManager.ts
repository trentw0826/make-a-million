import type { ServerMessage } from '@mam/protocol';
import type { ServerConfig } from './config';
import { newRoomCode } from './ids';
import type { Logger } from './log';
import { Room, type RoomError } from './room';

export interface RoomManagerDeps {
  readonly config: ServerConfig;
  readonly log: Logger;
  send(playerId: string, message: ServerMessage): void;
}

/** All live rooms, keyed by code. */
export class RoomManager {
  readonly rooms = new Map<string, Room>();

  constructor(private readonly deps: RoomManagerDeps) {}

  create(playerId: string, name: string): Room {
    this.leave(playerId);
    let code = newRoomCode();
    while (this.rooms.has(code)) code = newRoomCode();
    const room = new Room(code, {
      config: this.deps.config,
      log: this.deps.log,
      send: this.deps.send,
      onClosed: (closed) => this.rooms.delete(closed.code),
    });
    this.rooms.set(code, room);
    room.join(playerId, name);
    this.deps.log('info', 'room created', { room: code });
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
