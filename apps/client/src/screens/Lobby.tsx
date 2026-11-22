import type { Seat } from '@mam/engine';
import type { Difficulty, RoomView, SeatView } from '@mam/protocol';
import type { CSSProperties } from 'react';
import { SeatName } from '../components/SeatName';
import { DIFFICULTY_LABELS, DIFFICULTY_ORDER } from '../format';
import { type Spot, spotOf } from '../spots';
import { useGame } from '../store';

const SEAT_ORDER: readonly Seat[] = [0, 1, 2, 3];

/**
 * The room before the game: the table seen from above, with a chair at each side. Every
 * chair starts with a Normal bot, which makes way for whoever sits there. The chairs stay put:
 * Seat 1 at the bottom, then round the table, so you sit exactly where you click. Partners sit
 * across from each other, joined by a line in their side's colour.
 */
export function Lobby({ room }: { room: RoomView }) {
  const { state, send } = useGame();
  const isHost = state.me?.playerId === room.hostId;
  const anyHuman = room.seats.some((s) => s?.kind === 'human');
  // Sides are coloured from your point of view once you sit: yours gold, theirs blue.
  const myTeam = room.yourSeat === null ? 0 : room.yourSeat % 2;
  const sideOf = (seat: Seat) => (seat % 2 === myTeam ? 'us' : 'them');

  return (
    <main className="lobby">
      <section className="lobby-table" aria-label="Seats">
        <div className="lobby-felt">
          <svg
            className="partner-lines"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* From each chair toward its partner's, stopping short of the words between. */}
            <line className={`side-${sideOf(0)}`} x1="50" y1="4" x2="50" y2="22" />
            <line className={`side-${sideOf(0)}`} x1="50" y1="78" x2="50" y2="96" />
            <line className={`side-${sideOf(1)}`} x1="3" y1="50" x2="18" y2="50" />
            <line className={`side-${sideOf(1)}`} x1="82" y1="50" x2="97" y2="50" />
          </svg>
          <div className="lobby-felt-text">
            {isHost ? (
              <button
                type="button"
                className="primary"
                disabled={!anyHuman}
                onClick={() => send({ type: 'startGame' })}
              >
                Start game
              </button>
            ) : (
              <span className="muted">Waiting for the host…</span>
            )}
          </div>
        </div>
        {SEAT_ORDER.map((seat) => (
          <Chair
            key={seat}
            seat={seat}
            spot={spotOf(seat, 0)}
            side={sideOf(seat)}
            view={room.seats[seat]}
            isMine={room.yourSeat === seat}
            isHostSeat={
              room.seats[seat]?.kind === 'human' && room.seats[seat]?.playerId === room.hostId
            }
            isHost={isHost}
            onSit={() => send({ type: 'sit', seat })}
            onStand={() => send({ type: 'stand' })}
            onSetBot={(difficulty) => send({ type: 'setBot', seat, difficulty })}
          />
        ))}
      </section>
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
  onSetBot: (difficulty: Difficulty) => void;
}

/** One chair at the table: who sits there, and a way to take it or set its bot. */
function Chair(p: ChairProps) {
  const v = p.view;
  const bot = v?.kind === 'bot' ? v : null;
  const classes = ['chair', `chair-${p.spot}`, `side-${p.side}`];
  if (p.isMine) classes.push('chair-mine');
  if (bot) classes.push('chair-bot');
  return (
    <fieldset className={classes.join(' ')} aria-label={`Seat ${p.seat + 1}`}>
      <span className="chair-seat" aria-hidden="true">
        Seat {p.seat + 1}{' '}
        <span className="chair-partner">· partner Seat {partnerOf(p.seat) + 1}</span>
      </span>
      <div className="chair-avatar" aria-hidden="true">
        {bot ? <BotFace /> : (v?.name.slice(0, 1).toUpperCase() ?? '')}
      </div>
      {v && (
        <strong className="chair-name">
          {/* The host's level picker already says how strong the bot is. */}
          {bot && p.isHost ? bot.name : <SeatName seat={v} />}
          {p.isMine && <span className="muted"> (you)</span>}
          {p.isHostSeat && <span className="tag">host</span>}
          {v.kind === 'human' && !v.connected && <span className="tag warn">away</span>}
        </strong>
      )}
      {bot && p.isHost && (
        <fieldset
          className="bot-level"
          aria-label="Bot level"
          style={{ '--at': DIFFICULTY_ORDER.indexOf(bot.difficulty) } as CSSProperties}
        >
          {/* The highlight slides under the chosen level. */}
          <span className="bot-level-thumb" aria-hidden="true" />
          {DIFFICULTY_ORDER.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={bot.difficulty === d}
              onClick={() => bot.difficulty !== d && p.onSetBot(d)}
            >
              {DIFFICULTY_LABELS[d]}
            </button>
          ))}
        </fieldset>
      )}
      {(p.isMine || bot) && (
        <div className="chair-actions">
          {p.isMine ? (
            <button type="button" className="ghost small" onClick={p.onStand}>
              Stand up
            </button>
          ) : (
            <button type="button" className="primary small" onClick={p.onSit}>
              Sit here
            </button>
          )}
        </div>
      )}
    </fieldset>
  );
}

function partnerOf(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
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
