import { useState } from 'react';
import { sound } from '../sound/player';
import { useGame } from '../store';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { Button } from './ui/Button';
import { Wordmark } from './Wordmark';

/** Turns the game's sounds off and on; the choice is kept for next time. */
export function SoundToggle() {
  const [muted, setMuted] = useState(sound.isMuted);
  const toggle = () => {
    sound.setMuted(!muted);
    setMuted(!muted);
  };
  return (
    <Button
      variant="ghost"
      shape="square"
      aria-pressed={muted}
      aria-label="Mute sounds"
      title={muted ? 'Sounds are off' : 'Sounds are on'}
      onClick={toggle}
    >
      <Icon name={muted ? 'muted' : 'sound'} />
    </Button>
  );
}

/** Opens How to play (also the `?` key): a labelled button, or at the table a "?" icon. */
export function HelpButton({ icon = false }: { icon?: boolean }) {
  const { dispatch } = useGame();
  const open = () => dispatch({ kind: 'help', open: true });
  if (icon) {
    return (
      <Button
        variant="ghost"
        shape="square"
        aria-label="How to play"
        title="How to play (?)"
        aria-keyshortcuts="?"
        onClick={open}
      >
        <Icon name="help" />
      </Button>
    );
  }
  return (
    <Button variant="ghost" size="sm" aria-keyshortcuts="?" onClick={open}>
      How to play
    </Button>
  );
}

/**
 * Shown once the player is in a room: the brand on the left; the room code, sound, How to
 * play and Leave on the right. At the table, sound and How to play sit in the felt's corner
 * instead, by the player's seat. The home screen has no bar: its own table carries the name,
 * and sound and How to play sit in its corner as they do at the table.
 */
export function TopBar() {
  const { state, send } = useGame();
  const { room, view } = state;
  const atTable =
    room !== null && room.phase !== 'lobby' && view !== null && room.yourSeat !== null;
  const [confirming, setConfirming] = useState(false);
  // Leaving mid-game hands the seat to a bot at once (see Room.leave), so ask first.
  const midGame = room?.phase === 'playing' && room.yourSeat !== null;
  // If no other human is still at the table (every other human seat is played by a bot), the
  // game ends when you go, so say so.
  const mine = room?.yourSeat;
  const lastHuman =
    room?.seats.every((s, i) => i === mine || s?.kind !== 'human' || s.botControlled) ?? false;

  const leave = () => {
    setConfirming(false);
    send({ type: 'leaveRoom' });
  };

  if (!room) return null;
  return (
    <header className="topbar">
      <span className="brand">
        <Wordmark />
      </span>
      <nav className="topbar-actions" aria-label="Game">
        <span className="topbar-room">
          Room <strong className="room-code">{room.code}</strong>
        </span>
        {!atTable && (
          <>
            <SoundToggle />
            <HelpButton />
          </>
        )}
        <Button variant="ghost" size="sm" onClick={() => (midGame ? setConfirming(true) : leave())}>
          Leave
        </Button>
      </nav>
      {confirming && (
        <Modal
          title={lastHuman ? 'End the game?' : 'Leave the game?'}
          onClose={() => setConfirming(false)}
        >
          {lastHuman ? (
            <p>
              You're the last player at the table, so leaving ends the game. It can't be rejoined
              afterwards.
            </p>
          ) : (
            <p>
              A bot will play your seat right away. Rejoin with room code{' '}
              <strong className="room-code">{room.code}</strong> to take it back.
            </p>
          )}
          <div className="row">
            <Button onClick={() => setConfirming(false)}>Stay</Button>
            <Button variant="danger" onClick={leave}>
              {lastHuman ? 'Leave and end the game' : 'Leave game'}
            </Button>
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
