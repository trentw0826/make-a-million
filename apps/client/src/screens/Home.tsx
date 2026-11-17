import { motion } from 'motion/react';
import { type CSSProperties, type FormEvent, useState } from 'react';
import { CardFace } from '../components/CardFace';
import { Wordmark } from '../components/Wordmark';
import { storage } from '../storage';
import { codeFromHash, useGame } from '../store';
import { DEAL_MS, EASE_OUT } from '../theme/motion';

/** The cards fanned over the felt: a $40k at each end, and the Tiger, Bull and Bear. */
const SHOWCASE = [12, 52, 53, 54, 51] as const;

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
      {/* The table itself, before anyone sits: a hand of the game's best cards fanned over
          the felt, and the name. */}
      <section className="home-table" aria-labelledby="home-title">
        <div className="home-fan" aria-hidden="true">
          {SHOWCASE.map((id, i) => (
            <div
              key={id}
              className="home-fan-card"
              style={{ '--d': i - (SHOWCASE.length - 1) / 2 } as CSSProperties}
            >
              <motion.div
                className="home-fan-flip"
                initial={{ opacity: 0, y: 60, rotateY: 180 }}
                animate={{ opacity: 1, y: 0, rotateY: 0 }}
                transition={{ duration: DEAL_MS / 1000, delay: 0.1 + i * 0.09, ease: EASE_OUT }}
              >
                <CardFace id={id} />
              </motion.div>
            </div>
          ))}
        </div>
        <h1 id="home-title">
          <Wordmark size="large" />
        </h1>
        <p className="home-tagline">
          A partnership trick‑taking card game. Four seats; bring friends or bots.
        </p>
      </section>

      {/* A place card on the felt: your name, then start a table or join one. */}
      <div className="home-card">
        <form className="home-name" onSubmit={submit('create')}>
          <label>
            Your name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="e.g. Ada"
            />
          </label>
        </form>
        <div className="home-ways">
          <form className="home-way" onSubmit={submit('create')}>
            <h2>Start a table</h2>
            <p className="small">Get a room code to share, and fill empty seats with bots.</p>
            <button type="submit" className="primary" disabled={busy || !name.trim()}>
              Create a room
            </button>
          </form>
          <form className="home-way" onSubmit={submit('join')}>
            <h2>Join a table</h2>
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
        </div>
        <p className="home-help small">
          New to the game?{' '}
          <button
            type="button"
            className="link"
            onClick={() => dispatch({ kind: 'help', open: true })}
          >
            Read how to play
          </button>
          {busy && (
            <span className="muted" role="status">
              {' '}
              Connecting…
            </span>
          )}
        </p>
      </div>
    </main>
  );
}
