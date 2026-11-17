import { useState } from 'react';
import { sound } from '../sound/player';
import { useGame } from '../store';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { Wordmark } from './Wordmark';

/** Turns the game's sounds off and on; the choice is kept for next time. */
export function SoundToggle() {
  const [muted, setMuted] = useState(sound.isMuted);
  const toggle = () => {
    sound.setMuted(!muted);
    setMuted(!muted);
  };
  return (
    <button
      type="button"
      className="ghost small icon-btn"
      aria-pressed={muted}
      aria-label="Mute sounds"
      title={muted ? 'Sounds are off' : 'Sounds are on'}
      onClick={toggle}
    >
      <Icon name={muted ? 'muted' : 'sound'} />
    </button>
  );
}

/** Opens How to play (also the `?` key): a labelled button, or at the table a "?" icon. */
export function HelpButton({ icon = false }: { icon?: boolean }) {
  const { dispatch } = useGame();
  const open = () => dispatch({ kind: 'help', open: true });
  if (icon) {
    return (
      <button
        type="button"
        className="ghost small icon-btn"
        aria-label="How to play"
        title="How to play (?)"
        aria-keyshortcuts="?"
        onClick={open}
      >
        <Icon name="help" />
      </button>
    );
  }
  return (
    <button type="button" className="ghost small" aria-keyshortcuts="?" onClick={open}>
      How to play
    </button>
  );
}

/**
 * Shown on every screen: the brand on the left; the room code, sound, How to play and Leave
 * on the right. At the
 * table, sound and How to play sit in the felt's corner instead, by the player's seat.
 */
export function TopBar() {
  const { state, send } = useGame();
  const { room, view } = state;
  const atTable =
    room !== null && room.phase !== 'lobby' && view !== null && room.yourSeat !== null;
  const [confirming, setConfirming] = useState(false);
  // Leaving mid-game hands the seat to a bot at once (see Room.leave), so ask first.
  const midGame = room?.phase === 'playing' && room.yourSeat !== null;

  const leave = () => {
    setConfirming(false);
    send({ type: 'leaveRoom' });
  };

  return (
    <header className="topbar">
      {room && (
        <span className="brand">
          <Wordmark />
        </span>
      )}
      <nav className="topbar-actions" aria-label="Game">
        {room && (
          <span className="topbar-room">
            Room <strong className="room-code">{room.code}</strong>
          </span>
        )}
        {!atTable && (
          <>
            <SoundToggle />
            <HelpButton />
          </>
        )}
        {room && (
          <button
            type="button"
            className="ghost small"
            onClick={() => (midGame ? setConfirming(true) : leave())}
          >
            Leave
          </button>
        )}
      </nav>
      {confirming && room && (
        <Modal title="Leave the game?" onClose={() => setConfirming(false)}>
          <p>
            A bot will play your seat right away. Rejoin with room code{' '}
            <strong className="room-code">{room.code}</strong> to take it back.
          </p>
          <div className="row">
            <button type="button" onClick={() => setConfirming(false)}>
              Stay
            </button>
            <button type="button" className="warn-btn" onClick={leave}>
              Leave game
            </button>
          </div>
        </Modal>
      )}
    </header>
  );
}

/** A strip under the top bar while the link to the server is down. */
export function ConnectionBanner() {
  const { state } = useGame();
  if (!state.room || state.connection !== 'reconnecting') return null;
  return (
    <div className="conn-banner" role="status">
      Connection lost. Reconnecting…
    </div>
  );
}
