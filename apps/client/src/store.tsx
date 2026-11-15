import type { Action } from '@mam/engine';
import type { ClientMessage } from '@mam/protocol';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { GameSocket } from './socket';
import { type ClientState, initialState, type Msg, reduce } from './state';
import { storage } from './storage';

/** What to do once the server has greeted us. */
export type Intent = { readonly type: 'create' } | { readonly type: 'join'; readonly code: string };

export interface GameApi {
  readonly state: ClientState;
  /** Enter the game as `name`, then carry out `intent` (if any) once welcomed. */
  enter(name: string, intent: Intent | null): void;
  send(message: ClientMessage): void;
  act(action: Action): void;
  dispatch(msg: Msg): void;
}

const Ctx = createContext<GameApi | null>(null);

export function GameProvider({ children, url }: { children: ReactNode; url?: string }) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const intent = useRef<Intent | null>(null);
  const socket = useRef<GameSocket | null>(null);

  if (!socket.current) {
    socket.current = new GameSocket(
      url ?? GameSocket.defaultUrl(),
      (message) => {
        if (message.type === 'welcome') {
          storage.setToken(message.token);
          storage.setName(message.name);
          const next = intent.current;
          intent.current = null;
          if (next?.type === 'create') socket.current?.send({ type: 'createRoom' });
          else if (next?.type === 'join')
            socket.current?.send({ type: 'joinRoom', code: next.code });
        }
        if (message.type === 'room') window.location.hash = `#/room/${message.room.code}`;
        if (message.type === 'left') window.location.hash = '#/';
        dispatch({ kind: 'server', message });
      },
      (status) => dispatch({ kind: 'status', status }),
      () => {},
    );
  }

  // Returning visitors reconnect at once so a reload lands them back in their seat.
  useEffect(() => {
    const name = storage.name();
    if (name) socket.current?.connect({ name, token: storage.token() });
    return () => socket.current?.close();
  }, []);

  const enter = useCallback((name: string, next: Intent | null) => {
    intent.current = next;
    storage.setName(name);
    socket.current?.connect({ name, token: storage.token() });
  }, []);

  const send = useCallback((message: ClientMessage) => {
    if (!socket.current?.send(message)) {
      dispatch({ kind: 'toast', toast: { kind: 'error', text: 'Not connected to the server.' } });
    }
  }, []);

  const act = useCallback((action: Action) => send({ type: 'action', action }), [send]);

  const api = useMemo<GameApi>(
    () => ({ state, enter, send, act, dispatch }),
    [state, enter, send, act],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useGame(): GameApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useGame outside GameProvider');
  return api;
}

/** Room code from a shared link such as `#/room/ABC123`. */
export function codeFromHash(): string | null {
  const match = /#\/room\/([A-Za-z0-9]{6})/.exec(window.location.hash);
  return match?.[1]?.toUpperCase() ?? null;
}
