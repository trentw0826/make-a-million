import type { TableView } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { money, teamLabel } from '../format';
import { useGame } from '../store';

export function GameOver({ view, room }: { view: TableView; room: RoomView }) {
  const { state, send } = useGame();
  const isHost = state.me?.playerId === room.hostId;
  const winner = view.winner;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-labelledby="game-over-title">
        <h2 id="game-over-title">Game over</h2>
        {winner !== null && (
          <p>
            <strong>{teamLabel(room, winner)}</strong> {winner === view.team ? '(your side) ' : ''}
            make a million!
          </p>
        )}
        <p>
          {teamLabel(room, 0)}: {money(view.scores[0])} · {teamLabel(room, 1)}:{' '}
          {money(view.scores[1])}
        </p>
        <div className="row">
          {isHost ? (
            <button type="button" className="primary" onClick={() => send({ type: 'playAgain' })}>
              Play again
            </button>
          ) : (
            <span className="muted">The host can start a new game.</span>
          )}
          <button type="button" className="ghost" onClick={() => send({ type: 'leaveRoom' })}>
            Leave room
          </button>
        </div>
      </div>
    </div>
  );
}
