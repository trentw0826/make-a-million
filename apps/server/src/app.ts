import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WS_PATH } from '@mam/protocol';
import { WebSocketServer } from 'ws';
import { BotPool } from './botPool';
import type { ServerConfig } from './config';
import { Gateway } from './gateway';
import type { Logger } from './log';
import { RoomManager } from './roomManager';
import { SessionStore } from './sessions';
import { serveStatic } from './static';

export interface App {
  readonly http: Server;
  readonly wss: WebSocketServer;
  readonly sessions: SessionStore;
  readonly rooms: RoomManager;
  readonly gateway: Gateway;
  listen(): Promise<number>;
  close(): Promise<void>;
}

/** Wires sessions, rooms, the WebSocket gateway and static hosting into one HTTP server. */
export function createApp(config: ServerConfig, log: Logger): App {
  const sessions = new SessionStore();
  const gateway = new Gateway(sessions, log);
  const pool = new BotPool(config.botWorkers, log);
  const rooms = new RoomManager({
    config,
    log,
    send: (id, msg) => gateway.send(id, msg),
    decideBot: pool.decide,
  });
  gateway.attachManager(rooms);

  const http = createServer(serveStatic(config.staticDir));
  const wss = new WebSocketServer({ server: http, path: WS_PATH });
  gateway.attach(wss);

  return {
    http,
    wss,
    sessions,
    rooms,
    gateway,
    listen: () =>
      new Promise<number>((resolve, reject) => {
        http.once('error', reject);
        http.listen(config.port, () => {
          const port = (http.address() as AddressInfo).port;
          log('info', 'listening', { port });
          resolve(port);
        });
      }),
    close: () =>
      new Promise<void>((resolve) => {
        rooms.closeAll();
        for (const client of wss.clients) client.terminate();
        wss.close(() => http.close(() => void pool.close().then(resolve)));
      }),
  };
}
