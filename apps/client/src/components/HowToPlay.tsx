import {
  BEAR_ID,
  BULL_ID,
  DEFAULT_RULESET,
  type Phase,
  RANKS,
  type Ruleset,
  TIGER_ID,
} from '@mam/engine';
import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from 'react';
import { money } from '../format';
import { CardFace } from './CardFace';
import { Modal } from './Modal';
import { Button } from './ui/Button';

/** "$40k · $30k · $15k · 11 · $10k · …", highest first, straight from the engine's table. */
const RANK_ORDER = [...RANKS]
  .reverse()
  .map((rank) => (rank.endsWith('k') ? `$${rank}` : rank))
  .join(' · ');

/** The Red cards, highest first (Red's ids run 0–12, low to high). */
const RED_HIGH_TO_LOW = RANKS.map((_, i) => i).reverse();

const SHORTCUTS: readonly (readonly [string, string])[] = [
  ['?', 'Open or close How to play'],
  ['Esc', 'Close a dialog'],
  ['← →', 'Lower or raise your bid'],
  ['Enter', 'Main action: Bid, Discard, Next hand'],
];

type TopicId = 'goal' | 'cards' | 'specials' | 'bidding' | 'widow' | 'tricks' | 'scoring' | 'keys';

interface Topic {
  readonly id: TopicId;
  readonly title: string;
  readonly body: (ruleset: Ruleset) => ReactNode;
}

const TOPICS: readonly Topic[] = [
  {
    id: 'goal',
    title: 'The goal',
    body: ({ targetScore }) => (
      <>
        <p>
          Two partnerships, with partners sitting opposite, race to {money(targetScore)} by
          capturing Money cards in tricks.
        </p>
        <p>
          Each hand, one side wins the auction and must capture at least what it bid. The other side
          tries to stop it, and banks whatever it takes along the way.
        </p>
      </>
    ),
  },
  {
    id: 'cards',
    title: 'The cards',
    body: () => (
      <>
        <p>
          55 cards: four colors (Red, Yellow, Black, Green) of 13 cards each, plus the Tiger, Bull
          and Bear. Each color ranks, from high to low:
        </p>
        <div className="guide-cards guide-cards-rank" aria-hidden="true">
          {RED_HIGH_TO_LOW.map((id) => (
            <CardFace key={id} id={id} size="small" />
          ))}
        </div>
        <p className="rank-order">{RANK_ORDER}</p>
        <p>
          There is no 6, and the 11 sits between the $15k and the $10k. Only{' '}
          <strong>Money cards</strong> ($40k, $30k, $15k, $10k, $5k) score; the others are plain{' '}
          <strong>number cards</strong>.
        </p>
      </>
    ),
  },
  {
    id: 'specials',
    title: 'Tiger, Bull and Bear',
    body: () => (
      <>
        <ul className="guide-specials">
          <li>
            <CardFace id={TIGER_ID} size="small" />
            <span>
              <strong>Tiger</strong>: the highest trump. It counts as the trump color, so a Tiger
              lead calls for trump, and it can’t be played to another color you could follow.
            </span>
          </li>
          <li>
            <CardFace id={BULL_ID} size="small" />
            <span>
              <strong>Bull</strong>: doubles the Money in the trick it lands in.
            </span>
          </li>
          <li>
            <CardFace id={BEAR_ID} size="small" />
            <span>
              <strong>Bear</strong>: cancels the Money in its trick. When both fall in one trick,
              the one played last counts.
            </span>
          </li>
        </ul>
        <p>
          Bull and Bear can be played only before the trick has a color or when you are out of that
          color, and can be led only when nothing else is left in your hand.
        </p>
      </>
    ),
  },
  {
    id: 'bidding',
    title: 'Deal and bidding',
    body: ({ bidding, misdeal }) => (
      <>
        <p>
          Every card is dealt; three form the hidden widow, and bidding begins.
          {misdeal.enabled &&
            ` A player holding ${money(misdeal.threshold)} or less in Money may call a misdeal on their first turn to bid, instead of bidding or passing, and the same dealer deals again.`}
        </p>
        <p>
          The player left of the dealer {bidding.openerMustBid ? 'must open' : 'opens'} at{' '}
          {money(bidding.minOpeningBid)} or more. Going clockwise, each player raises by at least{' '}
          {money(bidding.raiseIncrement)} or passes for the rest of the hand. The last bidder takes
          the contract: their side must capture at least that much.
        </p>
      </>
    ),
  },
  {
    id: 'widow',
    title: 'Widow and trump',
    body: () => (
      <p>
        The winning bidder picks up the widow, discards three cards, then names trump. Number cards
        must go before Money, and the Tiger, Bull and Bear can never be discarded. Discards are out
        of play for the hand.
      </p>
    ),
  },
  {
    id: 'tricks',
    title: 'Playing tricks',
    body: () => (
      <>
        <p>
          The player to the bidder's left leads the first trick. Follow the color led if you can;
          otherwise play anything. The highest trump wins the trick, or else the highest card of the
          color led. The winner leads the next trick.
        </p>
        <p>
          You see just what you would at a real table: your own hand, the trick in progress, the
          bidding, how many tricks each player has taken, and the score sheet. Taken tricks are face
          down. There is no replay of earlier tricks and no running Money count until the hand is
          over.
        </p>
      </>
    ),
  },
  {
    id: 'scoring',
    title: 'Scoring',
    body: ({ targetScore }) => (
      <>
        <p>
          Each side counts the Money it captured: Bull tricks count double, Bear tricks count
          nothing.
        </p>
        <p>
          If the bidders reach their bid they score everything they took; if not, they are{' '}
          <em>set</em> and lose the amount of the bid. The other side always scores what it took.
        </p>
        <p>
          The first side to {money(targetScore)} wins; if both get there on the same hand, the
          higher score wins.
        </p>
      </>
    ),
  },
  {
    id: 'keys',
    title: 'Keyboard',
    body: () => (
      <dl className="keys">
        {SHORTCUTS.map(([key, what]) => (
          <div key={key}>
            <dt>
              <kbd>{key}</kbd>
            </dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    ),
  },
];

/** The topic that explains what the table is doing right now. */
function topicFor(phase: Phase | undefined): TopicId {
  switch (phase) {
    case 'bidding':
      return 'bidding';
    case 'discarding':
    case 'naming-trump':
      return 'widow';
    case 'playing':
      return 'tricks';
    case 'hand-complete':
    case 'game-over':
      return 'scoring';
    default:
      return 'goal';
  }
}

/**
 * The rules in brief, one topic at a time: a list of topics down the side (across the top on
 * a phone), Previous and Next to read straight through, and it opens on whatever the table is
 * doing. Every number comes from the ruleset the table is playing.
 */
export function HowToPlay({
  ruleset = DEFAULT_RULESET,
  phase,
  onClose,
}: {
  ruleset?: Ruleset;
  /** The table's phase, if at a table: the guide opens on the topic for it. */
  phase?: Phase | undefined;
  onClose: () => void;
}) {
  const [at, setAt] = useState(() => TOPICS.findIndex((t) => t.id === topicFor(phase)));
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();

  const go = (i: number, focus = false) => {
    const next = (i + TOPICS.length) % TOPICS.length;
    setAt(next);
    if (focus) tabs.current[next]?.focus();
  };
  // The topic list is one tab stop; the arrow keys move along it (the tabs pattern).
  const onTabKey = (e: KeyboardEvent) => {
    const step: Record<string, number> = {
      ArrowDown: at + 1,
      ArrowRight: at + 1,
      ArrowUp: at - 1,
      ArrowLeft: at - 1,
      Home: 0,
      End: TOPICS.length - 1,
    };
    const to = step[e.key];
    if (to === undefined) return;
    e.preventDefault();
    go(to, true);
  };

  const prev = TOPICS[at - 1];
  const next = TOPICS[at + 1];
  return (
    <Modal title="How to play" onClose={onClose} className="help">
      <div className="guide">
        <div className="guide-topics" role="tablist" aria-orientation="vertical">
          {TOPICS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-controls={`${base}-panel-${t.id}`}
              aria-selected={i === at}
              tabIndex={i === at ? 0 : -1}
              data-autofocus={i === at ? true : undefined}
              className="guide-topic"
              onClick={() => go(i)}
              onKeyDown={onTabKey}
            >
              <span className="guide-topic-step" aria-hidden="true">
                {i + 1}
              </span>
              {t.title}
            </button>
          ))}
        </div>
        {/* Every topic is laid out in the same spot, so the dialog keeps the size of the
            longest and doesn't jump as you move through; only the chosen one shows. */}
        <div className="guide-panels">
          {TOPICS.map((t, i) => (
            <section
              key={t.id}
              role="tabpanel"
              id={`${base}-panel-${t.id}`}
              aria-labelledby={`${base}-tab-${t.id}`}
              hidden={i !== at}
              className="guide-panel"
            >
              <h3>{t.title}</h3>
              {t.body(ruleset)}
            </section>
          ))}
        </div>
        <div className="guide-steps">
          {prev ? <Button onClick={() => go(at - 1)}>← {prev.title}</Button> : <span />}
          {next ? (
            <Button variant="primary" onClick={() => go(at + 1)}>
              {next.title} →
            </Button>
          ) : (
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
