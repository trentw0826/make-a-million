import { newPlayerId, newToken } from './ids';

export interface Session {
  readonly playerId: string;
  readonly token: string;
  name: string;
}

/**
 * Guest identities. A browser keeps its token and presents it on every connection, which
 * is how a player gets their seat back after a reload or a dropped connection.
 */
export class SessionStore {
  private readonly byToken = new Map<string, Session>();
  private readonly byPlayer = new Map<string, Session>();

  /** Returns the session for `token`, or a new one when the token is missing or unknown. */
  resolve(name: string, token?: string): Session {
    const existing = token ? this.byToken.get(token) : undefined;
    if (existing) {
      existing.name = name;
      return existing;
    }
    const session: Session = { playerId: newPlayerId(), token: newToken(), name };
    this.byToken.set(session.token, session);
    this.byPlayer.set(session.playerId, session);
    return session;
  }

  nameOf(playerId: string): string | undefined {
    return this.byPlayer.get(playerId)?.name;
  }

  get size(): number {
    return this.byToken.size;
  }
}
