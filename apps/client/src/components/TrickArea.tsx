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
import {
  FLIGHT_EASE,
  SKID_EASE,
  TRICK_ENTER_MS,
  TRICK_SKID_MS,
  TRICK_SKID_PX,
} from '../theme/motion';
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

/** Where a card lands on the felt. */
function target(cardId: number): TargetAndTransition {
  return {
    x: 0,
    y: 0,
    rotate: tilt(cardId),
    rotateY: 0,
    scale: 1,
    opacity: 1,
    transition: { duration: TRICK_ENTER_MS / 1000, ease: FLIGHT_EASE },
  };
}

/**
 * The last of a card's arrival: it touches down a little short of its spot, still moving,
 * and slides the rest of the way while friction slows it, twisting slightly as it goes.
 * Runs on an inner layer, on top of the flight (the outer layer, or the shared layout flight
 * for your own card): the offset grows from nothing during the flight, so the card leaves
 * the hand where it was, and is spent by the end of the slide.
 */
function skid(from: Spot, cardId: number): TargetAndTransition {
  const [px, py] = TOWARD[from];
  const twist = cardId % 2 === 0 ? 3 : -3;
  const landed = TRICK_ENTER_MS / (TRICK_ENTER_MS + TRICK_SKID_MS);
  return {
    x: [0, px * TRICK_SKID_PX, 0],
    y: [0, py * TRICK_SKID_PX, 0],
    rotate: [0, twist, 0],
    transition: {
      duration: (TRICK_ENTER_MS + TRICK_SKID_MS) / 1000,
      times: [0, landed, 1],
      ease: ['linear', SKID_EASE],
    },
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

/** The middle of the table: the trick in progress, and the one just taken while it lies there. */
export function TrickArea({ me, room, view, plays, completed }: Props) {
  const trump = view.trump;
  // While a finished trick is gathered, its cards are drawn in the winners' pile instead.
  const held = completed?.stage === 'hold' ? completed : null;
  const suit = trickSuit(plays, trump);
  const still = useReducedMotion() ?? false;

  // The card taking the trick, worked out from the cards face up on the felt.
  let winningCard: number | null = null;
  if (held) {
    winningCard = held.plays.find((p) => p.seat === held.winner)?.cardId ?? null;
  } else if (trump && plays.length > 0) {
    const leader = plays[0]?.seat ?? me;
    winningCard = currentWinner({ leader, plays, suit, winner: null }, trump)?.cardId ?? null;
  }

  let caption: string;
  if (held) caption = `${nameOf(room, held.winner)} takes the trick`;
  else if (view.phase !== 'playing') caption = '';
  else if (plays.length === 0) caption = `${nameOf(room, view.turn ?? me)} to lead`;
  else caption = suit ? `${SUIT_NAMES[suit]} led` : 'No color yet';

  // One keyed list, finished trick first: a card keeps its element when its trick completes,
  // so its entrance motion never replays.
  const cards = [...(held?.plays ?? []), ...plays];

  return (
    <section className="trick-area" aria-label="Trick">
      {cards.map((play) => {
        const from = spotOf(play.seat, me);
        const mine = play.seat === me;
        const [px, py] = TOWARD[from];
        // Your own card flies over from your hand (the shared layout id); the others' come
        // in face down from their side and turn over as they land. Every card's layout id
        // carries it on to the winners' pile (TrickPile) when its trick is gathered.
        const initial =
          mine || still
            ? false
            : { x: px * ENTER_FROM.x, y: py * ENTER_FROM.y, rotate: 0, rotateY: 180, opacity: 0 };
        return (
          <div key={play.cardId} className={`trick-card trick-${from}${mine ? ' trick-mine' : ''}`}>
            <motion.div
              className="trick-motion trick-enter"
              layoutId={cardLayoutId(play.cardId)}
              transition={{ layout: { duration: TRICK_ENTER_MS / 1000, ease: FLIGHT_EASE } }}
              initial={initial}
              animate={target(play.cardId)}
            >
              <motion.div
                className="trick-skid card-3d"
                initial={still ? false : { x: 0, y: 0, rotate: 0 }}
                animate={still ? { x: 0, y: 0, rotate: 0 } : skid(from, play.cardId)}
              >
                <CardFace
                  id={play.cardId}
                  size="small"
                  trump={trump !== null && isTrump(cardById(play.cardId), trump)}
                  winning={play.cardId === winningCard}
                />
                <div className="card-3d-back" aria-hidden="true">
                  <CardBackArt />
                </div>
              </motion.div>
            </motion.div>
          </div>
        );
      })}
      {/* The middle of the felt is left to the cards; what is happening is put in words
          for screen readers only, since sighted players see it in the cards. */}
      <div className="visually-hidden">{caption}</div>
    </section>
  );
}
