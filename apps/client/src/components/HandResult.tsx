import {
  type CardId,
  cardById,
  isNumberCard,
  otherTeam,
  type HandResult as Result,
  SEATS,
  type Seat,
  type Team,
  type TrickSummary,
  teamOf,
} from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { motion, useReducedMotion } from 'motion/react';
import { type CSSProperties, useEffect, useId, useState } from 'react';
import { money, nameOf, SUIT_NAMES, shortMoney, teamLabel } from '../format';
import type { ResultDeadline } from '../state';
import { useGame } from '../store';
import { EASE_OUT } from '../theme/motion';
import { CardFace } from './CardFace';
import { CountUp } from './CountUp';
import { Modal } from './Modal';

/**
 * Shown when the last trick is taken: both sides count their Money openly. The bid meter
 * says at a glance how the contract went; each side's tricks lie below as tiles, which show
 * their four cards on hover or focus.
 */
export function HandResult({
  result,
  room,
  team,
  seat,
  pending,
  target,
}: {
  result: Result;
  room: RoomView;
  /** The viewer's side, listed first. */
  team: Team;
  seat: Seat;
  /** Seats still reading the result. */
  pending: readonly Seat[];
  /** The score that wins the game. */
  target: number;
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
      <BidMeter result={result} bidders={bt === team ? 'us' : 'them'} still={still} />
      <div className="result-teams">
        {sides.map(({ side, name, key }) => {
          const tricks = result.tricks
            .map((t, i) => ({ ...t, n: i + 1 }))
            .filter((t) => teamOf(t.winner) === side);
          const delta = result.delta[side];
          const total = result.scoresAfter[side];
          const progress = Math.max(0, Math.min(100, (total / target) * 100));
          return (
            <section key={side} className={`result-team side-${key}`} aria-label={name}>
              <h3>
                <span className="side-dot" aria-hidden="true" />
                {name} <span className="muted small">{teamLabel(room, side)}</span>
              </h3>
              <div className={`result-delta ${delta < 0 ? 'neg' : 'pos'}`}>
                <span className="result-delta-label">
                  {side === bt && !result.made ? 'Set back' : 'Scores'}
                </span>
                <CountUp value={delta} format={signedMoney} />
              </div>
              <div className="result-total">
                <span className="muted small">
                  Captured {money(result.captured[side])} · Total {money(total)}
                </span>
                <div className="progress" aria-hidden="true">
                  <span style={{ width: `${progress}%` }} />
                </div>
              </div>
              <p className="result-trick-count muted small">
                {tricks.length === 0
                  ? 'No tricks taken'
                  : `${tricks.length} trick${tricks.length === 1 ? '' : 's'}`}
              </p>
              <ol className="trick-tiles">
                {tricks.map((t, i) => (
                  <motion.li
                    key={t.n}
                    initial={still ? false : { opacity: 0, y: 8, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.25 + i * 0.05, duration: 0.25 }}
                  >
                    <TrickTile trick={t} n={t.n} />
                  </motion.li>
                ))}
              </ol>
            </section>
          );
        })}
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
 * A tug of war over the hand's Money: the bidders' capture fills from the left, the other
 * side's from the right, and a notch marks the bid the bidders had to reach.
 */
function BidMeter({
  result,
  bidders,
  still,
}: {
  result: Result;
  bidders: 'us' | 'them';
  still: boolean;
}) {
  const bt = result.biddingTeam;
  const mine = result.captured[bt];
  const theirs = result.captured[otherTeam(bt)];
  const scale = Math.max(mine + theirs, result.bid, 1);
  const pct = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;
  const margin = Math.abs(mine - result.bid);
  const caption = result.made
    ? margin === 0
      ? 'made exactly'
      : `made by ${shortMoney(margin)}`
    : `short by ${shortMoney(margin)}`;
  const other = bidders === 'us' ? 'them' : 'us';
  const grow = (width: string, delay: number) => ({
    initial: still ? false : { width: '0%' },
    animate: { width },
    transition: { duration: 0.7, ease: EASE_OUT, delay },
  });
  return (
    <figure className="bid-meter">
      <div
        className="bid-meter-track"
        role="img"
        aria-label={`The bidders captured ${money(mine)} against a ${money(result.bid)} bid: ${caption}.`}
      >
        <motion.span className={`bid-meter-fill side-${bidders}`} {...grow(pct(mine), 0.2)} />
        <motion.span
          className={`bid-meter-fill bid-meter-other side-${other}`}
          {...grow(pct(theirs), 0.2)}
        />
        <span className="bid-meter-notch" style={{ left: pct(result.bid) }}>
          <span className="bid-meter-bid">Bid {shortMoney(result.bid)}</span>
        </span>
      </div>
      <figcaption className={`bid-meter-caption ${result.made ? 'made' : 'set'}`}>
        Captured {shortMoney(mine)}, {caption}
      </figcaption>
    </figure>
  );
}

function tileMoney(amount: number): string {
  return amount === 0 ? '$0' : shortMoney(amount);
}

/** What a card adds to a tile's row of pips: its colour, and filled if it carries Money. */
function pipClass(id: CardId): string {
  const card = cardById(id);
  if (card.kind !== 'suit') return `pip pip-${card.kind}`;
  return `pip pip-${card.suit}${isNumberCard(card) ? ' pip-plain' : ''}`;
}

/**
 * One taken trick: its value, a pip per card, and a mark for the Bull or Bear. Hovering or
 * focusing it lays its four cards out above it.
 */
function TrickTile({ trick, n }: { trick: TrickSummary; n: number }) {
  const id = useId();
  const mod = trick.modifier === 'bull' ? ' (Bull ×2)' : trick.modifier === 'bear' ? ' (Bear)' : '';
  return (
    <span className="trick-tip">
      <button
        type="button"
        className={`trick-tile mod-${trick.modifier}${trick.money === 0 ? ' trick-tile-empty' : ''}`}
        aria-label={`Trick ${n}: ${money(trick.value)}${mod}`}
        aria-describedby={id}
      >
        {/* A Bear trick shows the Money it would have been worth, struck out. */}
        <span className="trick-tile-value">
          {tileMoney(trick.modifier === 'bear' ? trick.money : trick.value)}
        </span>
        <span className="trick-tile-pips" aria-hidden="true">
          {trick.cardIds.map((c) => (
            <span key={c} className={pipClass(c)} />
          ))}
        </span>
        {trick.modifier !== 'none' && (
          <span className="trick-tile-mod" aria-hidden="true">
            {trick.modifier === 'bull' ? '×2' : 'Bear'}
          </span>
        )}
      </button>
      <span id={id} role="tooltip" className="trick-tip-cards">
        {trick.cardIds.map((c) => (
          <CardFace key={c} id={c} size="small" />
        ))}
      </span>
    </span>
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
