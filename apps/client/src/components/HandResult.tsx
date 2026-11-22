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
import {
  AFTER_MODAL_MS,
  DUR_BASE_MS,
  DUR_TICK_MS,
  EASE_OUT,
  POP_IN,
  POP_SPRING,
} from '../theme/motion';
import { BidTrack, bidCaption } from './BidTrack';
import { CardFace } from './CardFace';
import { CountUp } from './CountUp';
import { Modal } from './Modal';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';
import { Text } from './ui/Text';

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
    <Modal
      title={
        <>
          Hand {result.handNumber}
          <span className="result-sep" aria-hidden="true">
            •
          </span>
          {/* Green when the hand went your way, red when it didn't. */}
          <motion.span
            className={`result-status ${good ? 'good' : 'bad'}`}
            initial={still ? false : POP_IN.initial}
            animate={POP_IN.animate}
            transition={{ ...POP_SPRING, delay: AFTER_MODAL_MS / 1000 }}
          >
            {good && !still && <Burst />}
            <span className="visually-hidden">: </span>
            {banner}
          </motion.span>
        </>
      }
      className="result-modal"
    >
      <p className="result-contract">
        {nameOf(room, result.bidder)} bid <strong>{money(result.bid)}</strong> in{' '}
        <span className={`suit-word suit-${result.trump}`}>{SUIT_NAMES[result.trump]}</span>
      </p>
      <ScoreBar result={result} team={team} still={still} />
      <Button
        size="sm"
        shape="pill"
        className="result-cards-toggle"
        aria-expanded={showCards}
        aria-controls={cardsId}
        onClick={() => setShowCards((v) => !v)}
      >
        {showCards ? 'Hide the cards' : 'Show the cards'}
        <span className="result-cards-chevron" aria-hidden="true">
          ▾
        </span>
      </Button>
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
            transition={{ duration: DUR_BASE_MS / 1000, ease: EASE_OUT }}
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
          <Button variant="primary" data-autofocus onClick={() => act({ type: 'continue' })}>
            Ready
          </Button>
        ) : (
          <Text size="sm" tone="muted" className="ready-wait">
            Waiting for the others…
          </Text>
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
  const sides = [
    { side: team, name: 'Us', key: 'us' },
    { side: otherTeam(team), name: 'Them', key: 'them' },
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
            <Text
              size="2xl"
              weight="bold"
              tone={result.delta[side] < 0 ? 'bad' : 'good'}
              className="score-bar-delta"
            >
              <CountUp value={result.delta[side]} format={signedMoney} />
            </Text>
            <Text size="sm" tone="muted" numeric>
              Total {money(result.scoresAfter[side])}
            </Text>
          </section>
        ))}
      </div>
      <BidTrack result={result} team={team} still={still} />
      <figcaption className={`score-bar-caption ${result.made ? 'made' : 'set'}`}>
        Bidders captured {shortMoney(result.captured[result.biddingTeam])}, {bidCaption(result)}
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
    <Panel
      as="li"
      tone="outlined"
      pad="sm"
      className={`result-trick side-${side} mod-${trick.modifier}`}
    >
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
    </Panel>
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
    const id = window.setInterval(() => setNow(Date.now()), DUR_TICK_MS);
    return () => window.clearInterval(id);
  }, [running]);
  return now;
}
