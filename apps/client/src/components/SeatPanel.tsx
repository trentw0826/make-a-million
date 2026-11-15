import type { Seat, TableView } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { seatLabel } from '../format';
import { CardBack } from './CardFace';

interface Props {
  seat: Seat;
  room: RoomView;
  view: TableView;
  position: 'top' | 'left' | 'right';
}

/** Another player's place at the table: name, status, face-down cards. */
export function SeatPanel({ seat, room, view, position }: Props) {
  const s = room.seats[seat];
  const acting =
    view.turn === seat || (view.phase === 'misdeal-window' && view.misdeal.pending.includes(seat));
  const isDealer = view.dealer === seat;
  const isBidder = view.contract?.bidder === seat;
  return (
    <div className={`seat-panel seat-${position} ${acting ? 'seat-acting' : ''}`}>
      <div className="seat-name">
        {seatLabel(s)}
        {isDealer && <span className="tag">dealer</span>}
        {isBidder && <span className="tag">bidder</span>}
        {s?.kind === 'human' && !s.connected && (
          <span className="tag warn">{s.botControlled ? 'bot playing' : 'reconnecting…'}</span>
        )}
      </div>
      <CardBack count={view.handSizes[seat]} />
    </div>
  );
}
