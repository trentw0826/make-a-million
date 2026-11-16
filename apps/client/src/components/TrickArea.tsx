import {
  cardById,
  currentWinner,
  isTrump,
  type Seat,
  type TableView,
  type TrickPlay,
} from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { motion, type TargetAndTransition, useReducedMotion } from 'motion/react';
import { CardBackArt } from '../art/CardBackArt';
import { nameOf, SUIT_NAMES } from '../format';
import { trickSuit } from '../hints';
import { type Spot, spotOf, TOWARD } from '../spots';
import type { CompletedTrick } from '../state';
import { EASE_OUT, TRICK_ENTER_MS, TRICK_SWEEP_MS } from '../theme/motion';
import { CardFace } from './CardFace';

/** The id shared by a card in the hand and on the felt, so Motion flies it from one to the other. */
export function cardLayoutId(cardId: number): string {
  return `card-${cardId}`;
}

/** How far from its spot another player's card starts, toward their seat. */
const ENTER_FROM = { x: 170, y: 120 };

/** A small lean for each card as it lands, the same every time for the same card. */
function tilt(cardId: number): number {
  return ((cardId * 37) % 11) - 5;
}

/** Where a card lands on the felt, and, while its trick is gathered, where it goes. */
function target(from: Spot, sweepTo: Spot | null, cardId: number): TargetAndTransition {
  if (!sweepTo) {
    return {
      x: 0,
      y: 0,
      rotate: tilt(cardId),
      rotateY: 0,
      scale: 1,
      opacity: 1,
      transition: { duration: TRICK_ENTER_MS / 1000, ease: EASE_OUT },
    };
  }
  // Across to the winner's spot, then on toward their seat, turning face down.
  const [px, py] = TOWARD[from];
  const [wx, wy] = TOWARD[sweepTo];
  return {
    x: (wx - px) * 120 + wx * 80,
    y: (wy - py) * 90 + wy * 80,
    rotate: 0,
    rotateY: 180,
    scale: 0.6,
    opacity: 0,
    transition: { duration: TRICK_SWEEP_MS / 1000, ease: 'easeIn' },
  };
}

interface Props {
  me: Seat;
  room: RoomView;
  view: TableView;
  /** The trick in progress, from events (see `trickPlays` in state.ts). */
  plays: readonly TrickPlay[];
  completed: CompletedTrick | null;
}

/** The middle of the table: the trick in progress, and the one just taken while it is gathered. */
export function TrickArea({ me, room, view, plays, completed }: Props) {
  const trump = view.trump;
  const sweeping = completed?.stage === 'sweep';
  const winnerSpot = completed ? spotOf(completed.winner, me) : null;
  const suit = trickSuit(plays, trump);
  const still = useReducedMotion() ?? false;

  // The card taking the trick, worked out from the cards face up on the felt.
  let winningCard: number | null = null;
  if (completed && !sweeping) {
    winningCard = completed.plays.find((p) => p.seat === completed.winner)?.cardId ?? null;
  } else if (trump && plays.length > 0) {
    const leader = plays[0]?.seat ?? me;
    winningCard = currentWinner({ leader, plays, suit, winner: null }, trump)?.cardId ?? null;
  }

  let caption: string;
  if (completed && !sweeping) caption = `${nameOf(room, completed.winner)} takes the trick`;
  else if (view.phase !== 'playing') caption = '';
  else if (plays.length === 0) caption = `${nameOf(room, view.turn ?? me)} to lead`;
  else caption = suit ? `${SUIT_NAMES[suit]} led` : 'No color yet';

  // One keyed list, finished trick first: a card keeps its element when its trick completes,
  // so its entrance motion never replays.
  const cards = [
    ...(completed?.plays ?? []).map((play) => ({ play, sweepTo: sweeping ? winnerSpot : null })),
    ...plays.map((play) => ({ play, sweepTo: null })),
  ];

  return (
    <section className="trick-area" aria-label="Trick">
      {cards.map(({ play, sweepTo }) => {
        const from = spotOf(play.seat, me);
        const mine = play.seat === me;
        const [px, py] = TOWARD[from];
        // Your own card flies over from your hand (the shared layout id); the others' come
        // in face down from their side and turn over as they land.
        const initial =
          mine || still
            ? false
            : { x: px * ENTER_FROM.x, y: py * ENTER_FROM.y, rotate: 0, rotateY: 180, opacity: 0 };
        return (
          <div key={play.cardId} className={`trick-card trick-${from}${mine ? ' trick-mine' : ''}`}>
            <motion.div
              className={`trick-motion ${sweepTo ? `trick-sweep trick-to-${sweepTo}` : 'trick-enter'}`}
              {...(mine ? { layoutId: cardLayoutId(play.cardId) } : {})}
              initial={initial}
              animate={target(from, sweepTo, play.cardId)}
            >
              <div className="card-3d">
                <CardFace
                  id={play.cardId}
                  size="small"
                  trump={trump !== null && isTrump(cardById(play.cardId), trump)}
                  winning={play.cardId === winningCard}
                />
                <div className="card-3d-back" aria-hidden="true">
                  <CardBackArt />
                </div>
              </div>
            </motion.div>
          </div>
        );
      })}
      <div className="trick-caption">
        <span>{caption}</span>
      </div>
    </section>
  );
}
