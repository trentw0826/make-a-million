import {
  otherTeam,
  type HandResult as Result,
  SEATS,
  type Seat,
  type Team,
  type TrickSummary,
  teamOf,
} from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { type CSSProperties, useEffect, useId, useState } from 'react';
import { money, nameOf, SUIT_NAMES, shortMoney } from '../format';
import type { ResultDeadline } from '../state';
import { useGame } from '../store';
import { EASE_OUT } from '../theme/motion';
import { CardFace } from './CardFace';
import { CountUp } from './CountUp';
import { Modal } from './Modal';

/**
 * Shown when the last trick is taken: both sides count their Money openly. One bar says how
 * the hand went (the bid, what each side scored and now holds); the cards each trick was
 * taken with wait behind a button.
 */
export function HandResult({
  result,
  room,
  team,
  seat,
  pending,
}: {
  result: Result;
  room: RoomView;
  /** The viewer's side, shown on the left. */
  team: Team;
  seat: Seat;
  /** Seats still reading the result. */
  pending: readonly Seat[];
}) {
  const { act, state } = useGame();
  // Told from the viewer's side: their bid made is good news, the other side's is not.
  const ours = result.biddingTeam === team;
  const banner = ours
    ? result.made
      ? 'Your side made its bid'
      : 'Your side was set'
    : result.made
      ? 'They made their bid'
      : 'They were set';
  const good = ours === result.made;
  const still = useReducedMotion() ?? false;
  const [showCards, setShowCards] = useState(false);
  const cardsId = useId();
  return (
    <Modal title={`Hand ${result.handNumber}`} className="result-modal">
      <motion.p
        className={`result-banner ${good ? 'good' : 'bad'}`}
        initial={still ? false : { scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.12 }}
      >
        {good && !still && <Burst />}
        {banner}
      </motion.p>
      <p className="result-contract">
        {nameOf(room, result.bidder)} bid <strong>{money(result.bid)}</strong> in{' '}
        <span className={`suit-word suit-${result.trump}`}>{SUIT_NAMES[result.trump]}</span>
      </p>
      <ScoreBar result={result} team={team} still={still} />
      <button
        type="button"
        className="ghost small result-cards-toggle"
        aria-expanded={showCards}
        aria-controls={cardsId}
        onClick={() => setShowCards((v) => !v)}
      >
        {showCards ? 'Hide the cards' : 'Show the cards'}
      </button>
      <AnimatePresence initial={false}>
        {showCards && (
          <motion.section
            key="cards"
            id={cardsId}
            className="result-cards"
            aria-label="Cards played"
            initial={still ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={still ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          >
            <ol className="result-tricks">
              {result.tricks.map((t, i) => (
                <TrickRow
                  // biome-ignore lint/suspicious/noArrayIndexKey: tricks are fixed, in play order
                  key={i}
                  trick={t}
                  n={i + 1}
                  winner={t.winner === seat ? 'You' : nameOf(room, t.winner)}
                  side={teamOf(t.winner) === team ? 'us' : 'them'}
                />
              ))}
            </ol>
          </motion.section>
        )}
      </AnimatePresence>
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
          <button
            type="button"
            className="primary"
            data-autofocus
            onClick={() => act({ type: 'continue' })}
          >
            Ready
          </button>
        ) : (
          <span className="muted small ready-wait">Waiting for the others…</span>
        )}
      </div>
    </Modal>
  );
}

/** "+$97,000", or "−$185,000" for a side set back. */
function signedMoney(amount: number): string {
  return amount > 0 ? `+${money(amount)}` : money(amount);
}

/**
 * The hand on one bar, the viewer's side on the left: each side's captured Money slides in
 * from its own end, and a notch marks the bid, counted from the bidders' end. Above each end,
 * what that side scored this hand and the total it now holds.
 */
function ScoreBar({ result, team, still }: { result: Result; team: Team; still: boolean }) {
  const bt = result.biddingTeam;
  const them = otherTeam(team);
  const caught = result.captured[bt];
  const scale = Math.max(result.captured[team] + result.captured[them], result.bid, 1);
  const pct = (n: number) => Math.min(100, (n / scale) * 100);
  const bidAt = bt === team ? pct(result.bid) : 100 - pct(result.bid);
  const margin = Math.abs(caught - result.bid);
  const caption = result.made
    ? margin === 0
      ? 'made exactly'
      : `made by ${shortMoney(margin)}`
    : `short by ${shortMoney(margin)}`;
  const grow = (n: number) => ({
    initial: still ? false : { width: '0%' },
    animate: { width: `${pct(n)}%` },
    transition: { duration: 0.8, ease: EASE_OUT, delay: 0.2 },
  });
  const sides = [
    { side: team, name: 'Us', key: 'us' },
    { side: them, name: 'Them', key: 'them' },
  ] as const;
  return (
    <figure className="score-bar">
      <div className="score-bar-sides">
        {sides.map(({ side, name, key }) => (
          <section key={key} className={`score-bar-side side-${key}`} aria-label={name}>
            <span className="score-bar-name">
              <span className="side-dot" aria-hidden="true" />
              {name}
            </span>
            <span className={`score-bar-delta ${result.delta[side] < 0 ? 'neg' : 'pos'}`}>
              <CountUp value={result.delta[side]} format={signedMoney} />
            </span>
            <span className="score-bar-total">Total {money(result.scoresAfter[side])}</span>
          </section>
        ))}
      </div>
      <div
        className="score-bar-track"
        role="img"
        aria-label={`The bidders captured ${money(caught)} against a ${money(result.bid)} bid: ${caption}.`}
      >
        <motion.span className="score-bar-fill side-us" {...grow(result.captured[team])} />
        <motion.span
          className="score-bar-fill score-bar-right side-them"
          {...grow(result.captured[them])}
        />
        <span className="score-bar-notch" style={{ left: `${bidAt}%` }}>
          <span className="score-bar-bid">Bid {shortMoney(result.bid)}</span>
        </span>
      </div>
      <figcaption className={`score-bar-caption ${result.made ? 'made' : 'set'}`}>
        Bidders captured {shortMoney(caught)}, {caption}
      </figcaption>
    </figure>
  );
}

function trickMoney(amount: number): string {
  return amount === 0 ? '$0' : shortMoney(amount);
}

/** One trick, in play order: who took it, its four cards, and what it was worth. */
function TrickRow({
  trick,
  n,
  winner,
  side,
}: {
  trick: TrickSummary;
  n: number;
  winner: string;
  side: 'us' | 'them';
}) {
  const mod = trick.modifier === 'bull' ? ' ×2' : trick.modifier === 'bear' ? ' Bear' : '';
  return (
    <li className={`result-trick side-${side} mod-${trick.modifier}`}>
      <span className="result-trick-head">
        <span className="result-trick-who">
          <span className="side-dot" aria-hidden="true" />
          {n}. {winner}
        </span>
        <span className="result-trick-value">
          {/* A Bear trick shows the Money it would have been worth, struck out. */}
          <span className="result-trick-money">
            {trickMoney(trick.modifier === 'bear' ? trick.money : trick.value)}
          </span>
          {mod}
        </span>
      </span>
      <span className="result-trick-cards">
        {trick.cardIds.map((c) => (
          <CardFace key={c} id={c} size="small" />
        ))}
      </span>
    </li>
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
