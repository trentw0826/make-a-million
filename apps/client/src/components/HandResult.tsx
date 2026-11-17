import { otherTeam, type HandResult as Result, SEATS, type Seat, type Team } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { motion, useReducedMotion } from 'motion/react';
import { type CSSProperties, useEffect, useState } from 'react';
import { money, nameOf, SUIT_NAMES, teamLabel } from '../format';
import type { ResultDeadline } from '../state';
import { useGame } from '../store';
import { CardFace } from './CardFace';
import { CountUp } from './CountUp';
import { Modal } from './Modal';

/** Shown when the last trick is taken: both sides count their Money openly. */
export function HandResult({
  result,
  room,
  team,
  seat,
  pending,
}: {
  result: Result;
  room: RoomView;
  /** The viewer's side, listed first. */
  team: Team;
  seat: Seat;
  /** Seats still reading the result. */
  pending: readonly Seat[];
}) {
  const { act, state } = useGame();
  const bt = result.biddingTeam;
  // Told from the viewer's side: their bid made is good news, the other side's is not.
  const ours = bt === team;
  const banner = ours
    ? result.made
      ? 'Your side made its bid'
      : 'Your side was set'
    : result.made
      ? 'They made their bid'
      : 'They were set';
  const sides = [
    { side: team, name: 'Us', key: 'us' },
    { side: otherTeam(team), name: 'Them', key: 'them' },
  ] as const;
  const good = ours === result.made;
  const still = useReducedMotion() ?? false;
  return (
    <Modal title={`Hand ${result.handNumber}`}>
      <motion.p
        className={`result-banner ${good ? 'good' : 'bad'}`}
        initial={still ? false : { scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.12 }}
      >
        {good && !still && <Burst />}
        {banner}
      </motion.p>
      <p>
        {nameOf(room, result.bidder)} bid {money(result.bid)} in {SUIT_NAMES[result.trump]} and{' '}
        <strong>{result.made ? 'made it' : 'was set'}</strong>.
      </p>
      <div className="result-teams">
        {sides.map(({ side, name, key }) => (
          <div key={side} className={`result-team side-${key}`}>
            <h3>
              <span className="side-dot" aria-hidden="true" />
              {name} <span className="muted small">{teamLabel(room, side)}</span>
            </h3>
            <div>
              Captured <CountUp value={result.captured[side]} format={money} />
            </div>
            <div className={result.delta[side] < 0 ? 'neg' : ''}>
              {side === bt && !result.made ? 'Set back ' : 'Scores '}
              <CountUp value={result.delta[side]} format={money} />
            </div>
            <div className="muted small">Total {money(result.scoresAfter[side])}</div>
            <div className="result-tricks">
              {result.tricks
                .filter((t) => t.winner % 2 === side)
                .map((t) => (
                  <div
                    key={t.cardIds.join('-')}
                    className={`result-trick mod-${t.modifier}`}
                    title={`${money(t.value)}`}
                  >
                    {t.cardIds.map((id) => (
                      <CardFace key={id} id={id} size="small" />
                    ))}
                    <span className="small">
                      {money(t.value)}
                      {t.modifier === 'bull'
                        ? ' (Bull ×2)'
                        : t.modifier === 'bear'
                          ? ' (Bear)'
                          : ''}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="result-foot">
        <Countdown deadline={state.resultDeadline} />
        <ul className="ready-list" aria-label="Ready for the next hand">
          {SEATS.map((s) => {
            const ready = !pending.includes(s);
            return (
              <li key={s} className={ready ? 'is-ready' : 'is-reading'}>
                <span className="ready-mark" aria-hidden="true">
                  {ready ? '✓' : '…'}
                </span>
                {s === seat ? 'You' : nameOf(room, s)}
                <span className="visually-hidden">{ready ? ': ready' : ': still reading'}</span>
              </li>
            );
          })}
        </ul>
        {pending.includes(seat) ? (
          <button type="button" className="primary" onClick={() => act({ type: 'continue' })}>
            Ready
          </button>
        ) : (
          <span className="muted small ready-wait">Waiting for the others…</span>
        )}
      </div>
    </Modal>
  );
}

const SPARK_ANGLES = Array.from({ length: 14 }, (_, i) => (i * 360) / 14);

/** Gold sparks thrown out from the banner when the hand went your way. Placeholder effect. */
function Burst() {
  return (
    <span className="burst" aria-hidden="true">
      {SPARK_ANGLES.map((a) => (
        <span key={a} className="spark" style={{ '--a': `${a}deg` } as CSSProperties} />
      ))}
    </span>
  );
}

const RING_R = 16;
const RING_C = 2 * Math.PI * RING_R;

/** A ring that drains as the time to read the result runs out, with the seconds left. */
function Countdown({ deadline }: { deadline: ResultDeadline | null }) {
  const now = useNow(deadline !== null);
  if (!deadline) return null;
  const left = Math.max(0, deadline.endsAt - now);
  const fraction = deadline.totalMs > 0 ? left / deadline.totalMs : 0;
  const seconds = Math.ceil(left / 1000);
  return (
    <div
      className={`countdown${seconds <= 5 ? ' countdown-low' : ''}`}
      role="timer"
      aria-label={`Next hand in ${seconds} seconds`}
    >
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle className="countdown-track" cx="20" cy="20" r={RING_R} />
        <circle
          className="countdown-fill"
          cx="20"
          cy="20"
          r={RING_R}
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - fraction)}
        />
      </svg>
      <span aria-hidden="true">{seconds}</span>
    </div>
  );
}

/** `Date.now()`, refreshed several times a second while `running`. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [running]);
  return now;
}
