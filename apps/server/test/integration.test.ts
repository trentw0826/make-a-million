import { fallbackAction } from '@mam/bots';
import { type ClientMessage, type ServerMessage, WS_PATH } from '@mam/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { type App, createApp } from '../src/app';
import { testConfig } from '../src/config';
import { silentLogger } from '../src/log';

class Client {
  readonly messages: ServerMessage[] = [];
  private waiters: Array<{
    pred: (m: ServerMessage) => boolean;
    resolve: (m: ServerMessage) => void;
  }> = [];
  private constructor(readonly ws: WebSocket) {
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      this.messages.push(msg);
      this.waiters = this.waiters.filter((w) => {
        if (!w.pred(msg)) return true;
        w.resolve(msg);
        return false;
      });
    });
  }

  static async connect(port: number): Promise<Client> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    return new Client(ws);
  }

  send(message: ClientMessage): void {
    this.ws.send(JSON.stringify(message));
  }

  next<T extends ServerMessage['type']>(
    type: T,
    pred: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    return this.nextMatching((m) => m.type === type && pred(m as never), type) as Promise<
      Extract<ServerMessage, { type: T }>
    >;
  }

  /** The oldest queued message matching `pred`, or the next one to arrive. */
  nextMatching(pred: (m: ServerMessage) => boolean, label = 'message'): Promise<ServerMessage> {
    const existing = this.messages.find(pred);
    if (existing) {
      this.messages.splice(this.messages.indexOf(existing), 1);
      return Promise.resolve(existing);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), 5_000);
      this.waiters.push({
        pred,
        resolve: (m) => {
          clearTimeout(timer);
          this.messages.splice(this.messages.indexOf(m), 1);
          resolve(m);
        },
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.ws.once('close', () => resolve());
      this.ws.close();
    });
  }
}

let app: App;
let port: number;

beforeEach(async () => {
  app = createApp(testConfig({ graceMs: 200, roomIdleMs: 60_000 }), silentLogger);
  port = await app.listen();
});

afterEach(async () => {
  await app.close();
});

describe('over a real socket', () => {
  it('requires hello, then issues a reusable token', async () => {
    const c = await Client.connect(port);
    c.send({ type: 'createRoom' });
    expect((await c.next('error')).code).toBe('NOT_IDENTIFIED');
    c.send({ type: 'hello', name: 'Ann' });
    const welcome = await c.next('welcome');
    expect(welcome.name).toBe('Ann');
    expect(welcome.token.length).toBeGreaterThan(10);

    const again = await Client.connect(port);
    again.send({ type: 'hello', name: 'Ann', token: welcome.token });
    expect((await again.next('welcome')).playerId).toBe(welcome.playerId);
    await Promise.all([c.close(), again.close()]);
  });

  it('rejects malformed messages and unknown rooms', async () => {
    const c = await Client.connect(port);
    c.ws.send('{"type": "hello"}');
    expect((await c.next('error')).code).toBe('BAD_MESSAGE');
    c.send({ type: 'hello', name: 'Ann' });
    await c.next('welcome');
    c.send({ type: 'joinRoom', code: 'ZZZZZZ' });
    expect((await c.next('error')).code).toBe('ROOM_NOT_FOUND');
    await c.close();
  });

  it('plays a full game with one human and three bots, then survives a reconnect', async () => {
    const c = await Client.connect(port);
    c.send({ type: 'hello', name: 'Ann' });
    const { token } = await c.next('welcome');
    c.send({ type: 'createRoom' });
    const room = await c.next('room');
    expect(room.room.hostId).toBeTruthy();

    expect(room.room.seats.every((s) => s?.kind === 'bot' && s.difficulty === 'normal')).toBe(true);
    c.send({ type: 'sit', seat: 2 });
    c.send({ type: 'setBot', seat: 1, difficulty: 'easy' });
    await c.next(
      'room',
      (m) => m.room.seats[1]?.kind === 'bot' && m.room.seats[1].difficulty === 'easy',
    );
    c.send({ type: 'startGame' });
    await c.next('room', (m) => m.room.phase === 'playing');

    // Drop the connection mid-hand: the seat must come back on reconnect with the token.
    await c.next('view');
    await c.close();
    const c2 = await Client.connect(port);
    c2.send({ type: 'hello', name: 'Ann', token });
    await c2.next('welcome');
    const back = await c2.next('room');
    expect(back.room.phase).toBe('playing');
    expect(back.room.yourSeat).toBe(2);

    // Play on with the simplest legal action each time we are asked to act.
    let finished = false;
    for (let i = 0; i < 2_000 && !finished; i++) {
      const msg = await c2.nextMatching(
        (m) => m.type === 'view' || (m.type === 'room' && m.room.phase === 'finished'),
        'view or finished room',
      );
      if (msg.type !== 'view') {
        finished = true;
        break;
      }
      const action = fallbackAction(msg.view);
      if (action) c2.send({ type: 'action', action });
    }
    expect(finished).toBe(true);

    const roomState = app.rooms.rooms.values().next().value;
    expect(roomState?.phase).toBe('finished');
    await c2.close();
  }, 30_000);
});
