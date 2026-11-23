import { motion } from 'motion/react';
import { type CSSProperties, type FormEvent, useState } from 'react';
import { CardFace } from '../components/CardFace';
import { HelpButton, SoundToggle } from '../components/TopBar';
import { Button } from '../components/ui/Button';
import { Panel } from '../components/ui/Panel';
import { Text } from '../components/ui/Text';
import { Wordmark } from '../components/Wordmark';
import { storage } from '../storage';
import { codeFromHash, useGame } from '../store';
import { DEAL_MS, EASE_OUT, SHOWCASE_DELAY_MS, SHOWCASE_STAGGER_MS } from '../theme/motion';

/** The cards fanned over the felt: a $40k at each end, and the Tiger, Bull and Bear. */
const SHOWCASE = [12, 52, 53, 54, 51] as const;

export function Home() {
  const { state, enter, dispatch } = useGame();
  const [name, setName] = useState(storage.name() ?? '');
  const [code, setCode] = useState(codeFromHash() ?? '');
  const busy = state.connection === 'connecting';

  const submit = (intent: 'create' | 'join' | 'solo') => (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (intent === 'join') {
      const c = code.trim().toUpperCase();
      if (c.length !== 6) return;
      enter(trimmed, { type: 'join', code: c });
    } else {
      enter(trimmed, { type: intent });
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
                transition={{
                  duration: DEAL_MS / 1000,
                  delay: (SHOWCASE_DELAY_MS + i * SHOWCASE_STAGGER_MS) / 1000,
                  ease: EASE_OUT,
                }}
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
      <Panel tone="paper" pad="lg" className="home-card">
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
            <Text as="p" size="sm">
              Get a room code to share, and fill empty seats with bots.
            </Text>
            <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
              Create a room
            </Button>
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
            <Button type="submit" disabled={busy || !name.trim() || code.trim().length !== 6}>
              Join room
            </Button>
          </form>
        </div>
        {/* On your own: three bots of the levels you choose, and the analysis if you want it. */}
        <form className="home-way home-solo" onSubmit={submit('solo')}>
          <div className="home-solo-text">
            <h2>Play solo</h2>
            <Text as="p" size="sm">
              Practise against bots of your choosing, with an optional analysis of every move.
            </Text>
          </div>
          <Button type="submit" disabled={busy || !name.trim()}>
            Play solo
          </Button>
        </form>
        <Text as="p" size="sm" tone="muted" className="home-help">
          New to the game?{' '}
          <Button variant="link" onClick={() => dispatch({ kind: 'help', open: true })}>
            Read how to play
          </Button>
          {busy && <span role="status"> Connecting…</span>}
        </Text>
      </Panel>
      {/* Sound and How to play in the corner, where they sit at the table too. */}
      <div className="home-corner">
        <SoundToggle />
        <HelpButton icon />
      </div>
    </main>
  );
}
