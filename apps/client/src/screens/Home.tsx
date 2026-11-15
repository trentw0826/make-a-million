import { type FormEvent, useState } from 'react';
import { storage } from '../storage';
import { codeFromHash, useGame } from '../store';

export function Home() {
  const { state, enter, dispatch } = useGame();
  const [name, setName] = useState(storage.name() ?? '');
  const [code, setCode] = useState(codeFromHash() ?? '');
  const busy = state.connection === 'connecting';

  const submit = (intent: 'create' | 'join') => (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (intent === 'join') {
      const c = code.trim().toUpperCase();
      if (c.length !== 6) return;
      enter(trimmed, { type: 'join', code: c });
    } else {
      enter(trimmed, { type: 'create' });
    }
  };

  return (
    <main className="home">
      <h1>Make‑a‑Million</h1>
      <p className="muted">
        A partnership trick‑taking card game. Four seats; bring friends or bots.
      </p>

      <form className="panel home-form" onSubmit={submit('create')}>
        <label>
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="e.g. Ada"
          />
        </label>
        <button type="submit" className="primary" disabled={busy || !name.trim()}>
          Create a room
        </button>
      </form>

      <form className="panel home-form" onSubmit={submit('join')}>
        <label>
          Room code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="ABC123"
            className="code-input"
          />
        </label>
        <button type="submit" disabled={busy || !name.trim() || code.trim().length !== 6}>
          Join room
        </button>
      </form>

      <p className="muted small">
        New to the game?{' '}
        <button
          type="button"
          className="link"
          onClick={() => dispatch({ kind: 'help', open: true })}
        >
          Read how to play
        </button>
      </p>
      {busy && (
        <p className="muted small" role="status">
          Connecting…
        </p>
      )}
    </main>
  );
}
