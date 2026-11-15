import type { Seat, TableView, TrickPlay } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import type { CSSProperties } from 'react';
import { nameOf, SUIT_NAMES } from '../format';
import { trickSuit } from '../hints';
import type { CompletedTrick } from '../state';
import { CardFace } from './CardFace';

export type Spot = 'bottom' | 'left' | 'top' | 'right';

const SPOTS: readonly Spot[] = ['bottom', 'left', 'top', 'right'];

/** Where a seat sits on screen, seen from `me` (always at the bottom). */
export function spotOf(seat: Seat, me: Seat): Spot {
  return SPOTS[(seat - me + 4) % 4] ?? 'bottom';
}

/** Unit vectors from the middle of the felt toward each spot. */
const TOWARD: Readonly<Record<Spot, readonly [number, number]>> = {
  bottom: [0, 1],
  left: [-1, 0],
  top: [0, -1],
  right: [1, 0],
};

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
  const sweeping = completed?.stage === 'sweep';
  const winnerSpot = completed ? spotOf(completed.winner, me) : null;

  let caption: string;
  if (completed && !sweeping) caption = `${nameOf(room, completed.winner)} takes the trick`;
  else if (view.phase !== 'playing') caption = '';
  else if (plays.length === 0) caption = `${nameOf(room, view.turn ?? me)} to lead`;
  else {
    const suit = trickSuit(plays, view.trump);
    caption = suit ? `${SUIT_NAMES[suit]} led` : 'No suit yet';
  }

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
              <CardFace id={play.cardId} size="small" />
            </div>
          </div>
        );
      })}
      <div className="trick-caption">
        {view.trump && (
          <span className={`trump-badge suit-${view.trump}`}>Trump: {SUIT_NAMES[view.trump]}</span>
        )}
        <span>{caption}</span>
      </div>
    </section>
  );
}
