import {
  cardById,
  currentWinner,
  isTrump,
  type Seat,
  type TableView,
  type TrickPlay,
} from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import type { CSSProperties } from 'react';
import { nameOf, SUIT_NAMES } from '../format';
import { trickSuit } from '../hints';
import { type Spot, spotOf, TOWARD } from '../spots';
import type { CompletedTrick } from '../state';
import { CardFace } from './CardFace';

/** Offsets that drive the CSS motions: where a card slides in from, and where it sweeps to. */
function motionStyle(from: Spot, to: Spot | null): CSSProperties {
  const [px, py] = TOWARD[from];
  if (!to) return { '--fx': `${px * 70}px`, '--fy': `${py * 70}px` } as CSSProperties;
  const [wx, wy] = TOWARD[to];
  // Across to the winner's spot, then a little further toward their seat.
  return {
    '--dx': `${(wx - px) * 120 + wx * 60}px`,
    '--dy': `${(wy - py) * 90 + wy * 60}px`,
  } as CSSProperties;
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
        const motion = sweepTo
          ? `trick-sweep trick-to-${sweepTo}`
          : `trick-enter trick-from-${from}`;
        return (
          <div key={play.cardId} className={`trick-card trick-${from}`}>
            <div className={`trick-motion ${motion}`} style={motionStyle(from, sweepTo)}>
              <CardFace
                id={play.cardId}
                size="small"
                trump={trump !== null && isTrump(cardById(play.cardId), trump)}
                winning={play.cardId === winningCard}
              />
            </div>
          </div>
        );
      })}
      <div className="trick-caption">
        <span>{caption}</span>
      </div>
    </section>
  );
}
