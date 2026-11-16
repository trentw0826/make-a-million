import { useState } from 'react';
import { useGame } from '../store';
import { Modal } from './Modal';
import { Wordmark } from './Wordmark';

export function inviteUrl(code: string): string {
  return `${window.location.origin}${window.location.pathname}#/room/${code}`;
}

/** Copies the room's invite link, or shows it for copying by hand without a clipboard. */
export function InviteButton({ code, className }: { code: string; className?: string }) {
  const { dispatch } = useGame();
  const [manual, setManual] = useState<string | null>(null);

  const copy = async () => {
    const url = inviteUrl(code);
    try {
      await navigator.clipboard.writeText(url);
      dispatch({ kind: 'toast', toast: { kind: 'info', text: 'Invite link copied.' } });
    } catch {
      // No clipboard (an insecure origin, or permission refused): show the link instead.
      setManual(url);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={() => void copy()}>
        Copy invite link
      </button>
      {manual && (
        <Modal title="Invite link" onClose={() => setManual(null)}>
          <p>Send this link to the other players:</p>
          <input
            readOnly
            value={manual}
            aria-label="Invite link"
            onFocus={(e) => e.currentTarget.select()}
          />
        </Modal>
      )}
    </>
  );
}

/** Shown on every screen: the room, an invite link, How to play, and Leave. */
export function TopBar() {
  const { state, send, dispatch } = useGame();
  const { room } = state;
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
      {room && (
        <div className="topbar-room">
          <span>
            Room <strong className="room-code">{room.code}</strong>
          </span>
          <InviteButton code={room.code} className="ghost small" />
        </div>
      )}
      <nav className="topbar-actions" aria-label="Game">
        <button
          type="button"
          className="ghost small"
          aria-keyshortcuts="?"
          onClick={() => dispatch({ kind: 'help', open: true })}
        >
          How to play
        </button>
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
