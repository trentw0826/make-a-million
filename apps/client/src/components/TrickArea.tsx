import type { Seat, TableView, TrickPlay } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { nameOf, SUIT_NAMES } from '../format';
import type { CompletedTrick } from '../state';
import { CardFace } from './CardFace';

interface Props {
  me: Seat;
  room: RoomView;
  view: TableView;
  completed: CompletedTrick | null;
}

function positionOf(seat: Seat, me: Seat): 'bottom' | 'left' | 'top' | 'right' {
  const rel = (seat - me + 4) % 4;
  return (['bottom', 'left', 'top', 'right'] as const)[rel] ?? 'bottom';
}

/** The middle of the table: the trick in progress (or the one just taken, briefly). */
export function TrickArea({ me, room, view, completed }: Props) {
  const plays: readonly TrickPlay[] = completed
    ? completed.plays
    : (view.currentTrick?.plays ?? []);
  const suit = view.currentTrick?.suit ?? null;

  let caption: string;
  if (completed) caption = `${nameOf(room, completed.winner)} takes the trick`;
  else if (view.phase !== 'playing') caption = '';
  else if (plays.length === 0) caption = `${nameOf(room, view.turn ?? me)} to lead`;
  else caption = suit ? `${SUIT_NAMES[suit]} led` : 'No suit yet';

  return (
    <div className={`trick-area ${completed ? 'trick-complete' : ''}`}>
      {plays.map((p) => (
        <div key={p.cardId} className={`trick-card trick-${positionOf(p.seat, me)}`}>
          <CardFace id={p.cardId} size="small" />
        </div>
      ))}
      <div className="trick-caption">
        {view.trump && (
          <span className={`trump-badge suit-${view.trump}`}>Trump: {SUIT_NAMES[view.trump]}</span>
        )}
        <span>{caption}</span>
      </div>
    </div>
  );
}
