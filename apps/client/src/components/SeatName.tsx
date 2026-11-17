import type { SeatView } from '@mam/protocol';
import { DIFFICULTY_LABELS } from '../format';

/** A seat's name; a bot's strength follows it faintly, "Bot 2 Hard". */
export function SeatName({ seat }: { seat: SeatView }) {
  if (!seat) return <>Empty seat</>;
  if (seat.kind !== 'bot') return <>{seat.name}</>;
  return (
    <>
      {seat.name} <span className="seat-difficulty">{DIFFICULTY_LABELS[seat.difficulty]}</span>
    </>
  );
}
