import { type ClientMessage, type ServerMessage, WS_PATH } from '@mam/protocol';
import type { Connection } from './state';

export interface Hello {
  readonly name: string;
  readonly token: string | null;
}

/**
 * A WebSocket to the game server that identifies itself on every (re)connection and
 * reconnects with backoff when the link drops.
 */
export class GameSocket {
  private ws: WebSocket | null = null;
  private hello: Hello | null = null;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private readonly url: string,
    private readonly onMessage: (message: ServerMessage) => void,
    private readonly onStatus: (status: Connection) => void,
    private readonly onOpen: () => void,
  ) {}

  static defaultUrl(): string {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}${WS_PATH}`;
  }

  /** Connects (or re-identifies an open connection) as `hello`. */
  connect(hello: Hello): void {
    this.hello = hello;
    this.stopped = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendHello();
      return;
    }
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) this.open();
  }

  send(message: ClientMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  close(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
    this.onStatus('idle');
  }

  private open(): void {
    this.onStatus(this.attempts === 0 ? 'connecting' : 'reconnecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.sendHello();
      this.onStatus('open');
      this.onOpen();
    };
    ws.onmessage = (ev) => {
      try {
        this.onMessage(JSON.parse(String(ev.data)) as ServerMessage);
      } catch {
        // Ignore anything that is not a JSON server message.
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped) return;
      this.attempts += 1;
      const delay = Math.min(10_000, 1_000 * 2 ** Math.min(this.attempts - 1, 4));
      this.onStatus('reconnecting');
      this.timer = setTimeout(() => this.open(), delay);
    };
    ws.onerror = () => {
      // onclose follows and handles the retry.
    };
  }

  private sendHello(): void {
    if (!this.hello) return;
    this.send({
      type: 'hello',
      name: this.hello.name,
      ...(this.hello.token ? { token: this.hello.token } : {}),
    });
  }
}
