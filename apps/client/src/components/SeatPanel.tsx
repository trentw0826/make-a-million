import { partnerOf, type Seat, type TableView } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { hasPassed, seatChip } from '../hints';
import { CardBack } from './CardFace';
import { SeatBadge } from './SeatBadge';
import { SeatName } from './SeatName';

interface Props {
  seat: Seat;
  room: RoomView;
  view: TableView;
  position: 'top' | 'left' | 'right';
}

/** True when the table is waiting on `seat`. */
export function isActing(view: TableView, seat: Seat): boolean {
  return view.turn === seat;
}

/** Another player's place at the table: name, side, what they said, face-down cards. */
export function SeatPanel({ seat, room, view, position }: Props) {
  const s = room.seats[seat];
  const acting = isActing(view, seat);
  const partner = seat === partnerOf(view.seat);
  const chip = seatChip(view, seat);
  const classes = ['seat-panel', `seat-${position}`, partner ? 'side-us' : 'side-them'];
  if (acting) classes.push('seat-acting');
  if (hasPassed(view, seat)) classes.push('seat-passed');
  return (
    <div className={classes.join(' ')}>
      <div className="seat-name">
        <span className="side-dot" aria-hidden="true" />
        <SeatName seat={s} />
        <span className="visually-hidden">, {partner ? 'your partner' : 'opponent'}</span>
        {s?.kind === 'human' && !s.connected && (
          <span className="tag warn">{s.botControlled ? 'bot playing' : 'reconnecting…'}</span>
        )}
      </div>
      <div className="seat-role">
        <SeatBadge chip={chip} />
      </div>
      <CardBack count={view.handSizes[seat]} />
    </div>
  );
}
