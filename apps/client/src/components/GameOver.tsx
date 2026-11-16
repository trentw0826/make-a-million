import { otherTeam, type TableView } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { money, teamLabel } from '../format';
import { useGame } from '../store';
import { Modal } from './Modal';

export function GameOver({ view, room }: { view: TableView; room: RoomView }) {
  const { state, send } = useGame();
  const isHost = state.me?.playerId === room.hostId;
  const winner = view.winner;
  const us = view.team;
  const them = otherTeam(us);
  return (
    <Modal title="Game over">
      {winner !== null && (
        <p className={`result-banner ${winner === us ? 'good' : 'bad'}`}>
          {winner === us
            ? 'Your side makes a million!'
            : `${teamLabel(room, winner)} make a million.`}
        </p>
      )}
      <p>
        Us ({teamLabel(room, us)}): <strong>{money(view.scores[us])}</strong> · Them (
        {teamLabel(room, them)}): <strong>{money(view.scores[them])}</strong>
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
    </Modal>
  );
}
