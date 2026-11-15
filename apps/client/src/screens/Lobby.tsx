import type { Seat } from '@mam/engine';
import type { RoomView, SeatView } from '@mam/protocol';
import { InviteButton } from '../components/TopBar';
import { seatLabel } from '../format';
import { useGame } from '../store';

const SEAT_ORDER: readonly Seat[] = [0, 1, 2, 3];

export function Lobby({ room }: { room: RoomView }) {
  const { state, send } = useGame();
  const isHost = state.me?.playerId === room.hostId;
  const seated = room.yourSeat !== null;
  const full = room.seats.every((s) => s !== null);
  const anyHuman = room.seats.some((s) => s?.kind === 'human');

  return (
    <main className="lobby">
      <header className="lobby-header">
        <h1>Room {room.code}</h1>
        <div className="lobby-share">
          <span className="muted">Share the code or the link with your table.</span>
          <InviteButton code={room.code} />
        </div>
        <p className="muted">Partners sit opposite each other: seats 1 & 3 against 2 & 4.</p>
      </header>

      <section className="seats-grid" aria-label="Seats">
        {SEAT_ORDER.map((seat) => (
          <SeatCard
            key={seat}
            seat={seat}
            view={room.seats[seat]}
            isMine={room.yourSeat === seat}
            isHostSeat={
              room.seats[seat]?.kind === 'human' && room.seats[seat]?.playerId === room.hostId
            }
            canSit={!room.seats[seat]}
            isHost={isHost}
            onSit={() => send({ type: 'sit', seat })}
            onStand={() => send({ type: 'stand' })}
            onAddBot={(difficulty) => send({ type: 'addBot', seat, difficulty })}
            onRemoveBot={() => send({ type: 'removeBot', seat })}
          />
        ))}
      </section>

      <footer className="lobby-actions">
        {isHost ? (
          <button
            type="button"
            className="primary"
            disabled={!full || !anyHuman}
            onClick={() => send({ type: 'startGame' })}
            title={full ? '' : 'All four seats must be filled'}
          >
            Start game
          </button>
        ) : (
          <span className="muted">Waiting for the host to start…</span>
        )}
        {!seated && <span className="muted">Pick a seat to play.</span>}
      </footer>
    </main>
  );
}

interface SeatCardProps {
  seat: Seat;
  view: SeatView;
  isMine: boolean;
  isHostSeat: boolean;
  canSit: boolean;
  isHost: boolean;
  onSit: () => void;
  onStand: () => void;
  onAddBot: (difficulty: 'easy' | 'normal') => void;
  onRemoveBot: () => void;
}

function SeatCard(p: SeatCardProps) {
  const team = p.seat % 2 === 0 ? 'A' : 'B';
  return (
    <div className={`seat-card ${p.isMine ? 'seat-mine' : ''}`}>
      <div className="seat-title">
        Seat {p.seat + 1} <span className="muted">· team {team}</span>
      </div>
      <div className="seat-body">
        {p.view ? (
          <>
            <strong>{seatLabel(p.view)}</strong>
            {p.isHostSeat && <span className="tag">host</span>}
            {p.view.kind === 'human' && !p.view.connected && <span className="tag warn">away</span>}
          </>
        ) : (
          <span className="muted">Empty</span>
        )}
      </div>
      <div className="seat-actions">
        {p.isMine && (
          <button type="button" className="ghost" onClick={p.onStand}>
            Stand up
          </button>
        )}
        {p.canSit && (
          <button type="button" onClick={p.onSit}>
            Sit here
          </button>
        )}
        {p.canSit && p.isHost && (
          <>
            <button type="button" className="ghost" onClick={() => p.onAddBot('easy')}>
              + Bot · Easy
            </button>
            <button type="button" className="ghost" onClick={() => p.onAddBot('normal')}>
              + Bot · Normal
            </button>
          </>
        )}
        {p.view?.kind === 'bot' && p.isHost && (
          <button type="button" className="ghost" onClick={p.onRemoveBot}>
            Remove bot
          </button>
        )}
      </div>
    </div>
  );
}
