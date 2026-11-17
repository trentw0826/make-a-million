import type { Seat } from '@mam/engine';
import type { Difficulty, RoomView, SeatView } from '@mam/protocol';
import { LayoutGroup, motion } from 'motion/react';
import { InviteButton } from '../components/TopBar';
import { DIFFICULTY_LABELS, DIFFICULTY_ORDER, seatLabel } from '../format';
import { type Spot, spotOf } from '../spots';
import { useGame } from '../store';

const SEAT_ORDER: readonly Seat[] = [0, 1, 2, 3];

/**
 * The room before the game: the table seen from above, with a chair at each side. Once you
 * sit, the table turns so your chair is at the bottom, as it will be in play, with your
 * partner across from you. Partners are joined by a line in their side's colour.
 */
export function Lobby({ room }: { room: RoomView }) {
  const { state, send } = useGame();
  const isHost = state.me?.playerId === room.hostId;
  const seated = room.yourSeat !== null;
  const full = room.seats.every((s) => s !== null);
  const anyHuman = room.seats.some((s) => s?.kind === 'human');
  // Sides are coloured from your point of view once you sit: yours gold, theirs blue.
  const myTeam = room.yourSeat === null ? 0 : room.yourSeat % 2;
  const sideOf = (seat: Seat) => (seat % 2 === myTeam ? 'us' : 'them');

  return (
    <main className="lobby">
      <header className="lobby-header">
        <h1>
          Room <span className="room-code">{room.code}</span>
        </h1>
        <div className="lobby-share">
          <span className="muted">Share the code or the link with your table.</span>
          <InviteButton code={room.code} />
        </div>
      </header>

      <LayoutGroup>
        <section className="lobby-table" aria-label="Seats">
          <div className="lobby-felt">
            <svg
              className="partner-lines"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {/* From each chair toward its partner's, stopping short of the words between. */}
              <line className="side-us" x1="50" y1="4" x2="50" y2="22" />
              <line className="side-us" x1="50" y1="78" x2="50" y2="96" />
              <line className="side-them" x1="3" y1="50" x2="18" y2="50" />
              <line className="side-them" x1="82" y1="50" x2="97" y2="50" />
            </svg>
            <div className="lobby-felt-text">
              <p className="muted small">Partners sit across from each other.</p>
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
              {!seated && <span className="muted small">Pick a chair to play.</span>}
            </div>
          </div>
          {SEAT_ORDER.map((seat) => (
            <Chair
              key={seat}
              seat={seat}
              spot={spotOf(seat, room.yourSeat ?? 0)}
              side={sideOf(seat)}
              view={room.seats[seat]}
              isMine={room.yourSeat === seat}
              isHostSeat={
                room.seats[seat]?.kind === 'human' && room.seats[seat]?.playerId === room.hostId
              }
              isHost={isHost}
              onSit={() => send({ type: 'sit', seat })}
              onStand={() => send({ type: 'stand' })}
              onAddBot={(difficulty) => send({ type: 'addBot', seat, difficulty })}
              onRemoveBot={() => send({ type: 'removeBot', seat })}
            />
          ))}
        </section>
      </LayoutGroup>
    </main>
  );
}

interface ChairProps {
  seat: Seat;
  spot: Spot;
  side: 'us' | 'them';
  view: SeatView;
  isMine: boolean;
  isHostSeat: boolean;
  isHost: boolean;
  onSit: () => void;
  onStand: () => void;
  onAddBot: (difficulty: Difficulty) => void;
  onRemoveBot: () => void;
}

/** One chair at the table: who sits there, or a way to fill it. */
function Chair(p: ChairProps) {
  const v = p.view;
  const classes = ['chair', `chair-${p.spot}`, `side-${p.side}`];
  if (p.isMine) classes.push('chair-mine');
  if (!v) classes.push('chair-empty');
  return (
    <motion.div
      layout
      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      className={classes.join(' ')}
      aria-label={`Seat ${p.seat + 1}`}
      role="group"
    >
      <div className="chair-avatar" aria-hidden="true">
        {v ? v.kind === 'bot' ? <BotFace /> : v.name.slice(0, 1).toUpperCase() : '+'}
      </div>
      <div className="chair-who">
        {v ? (
          <>
            <strong className="chair-name">
              {seatLabel(v)}
              {p.isMine && <span className="muted"> (you)</span>}
            </strong>
            <span className="chair-tags">
              {p.isHostSeat && <span className="tag">host</span>}
              {v.kind === 'human' && !v.connected && <span className="tag warn">away</span>}
            </span>
          </>
        ) : (
          <span className="muted">Empty chair</span>
        )}
      </div>
      <div className="chair-actions">
        {p.isMine && (
          <button type="button" className="ghost small" onClick={p.onStand}>
            Stand up
          </button>
        )}
        {!v && (
          <button type="button" className="primary small" onClick={p.onSit}>
            Sit here
          </button>
        )}
        {!v && p.isHost && (
          <fieldset className="add-bot">
            <legend className="muted small">or add a bot</legend>
            {DIFFICULTY_ORDER.map((d) => (
              <button
                key={d}
                type="button"
                className="ghost small"
                aria-label={`+ Bot · ${DIFFICULTY_LABELS[d]}`}
                onClick={() => p.onAddBot(d)}
              >
                {DIFFICULTY_LABELS[d]}
              </button>
            ))}
          </fieldset>
        )}
        {v?.kind === 'bot' && p.isHost && (
          <button type="button" className="ghost small" onClick={p.onRemoveBot}>
            Remove bot
          </button>
        )}
      </div>
    </motion.div>
  );
}

/** A simple robot face for a bot's chair. */
function BotFace() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <path d="M12 3v4M9 12h.01M15 12h.01M9 16h6" strokeLinecap="round" />
    </svg>
  );
}
