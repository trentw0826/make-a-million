import { otherTeam, type TableView } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { money, teamLabel } from '../format';
import { useGame } from '../store';
import { Modal } from './Modal';
import { Button } from './ui/Button';
import { Text } from './ui/Text';

export function GameOver({ view, room }: { view: TableView; room: RoomView }) {
  const { state, send } = useGame();
  const isHost = state.me?.playerId === room.hostId;
  const winner = view.winner;
  const us = view.team;
  const them = otherTeam(us);
  return (
    <Modal title="Game over">
      {winner !== null && (
        <Text
          as="p"
          size="lg"
          weight="bold"
          tone={winner === us ? 'good' : 'bad'}
          className={`result-banner ${winner === us ? 'good' : 'bad'}`}
        >
          {winner === us
            ? 'Your side makes a million!'
            : `${teamLabel(room, winner)} make a million.`}
        </Text>
      )}
      <p>
        Us ({teamLabel(room, us)}): <strong>{money(view.scores[us])}</strong> · Them (
        {teamLabel(room, them)}): <strong>{money(view.scores[them])}</strong>
      </p>
      <div className="row">
        {isHost ? (
          <Button variant="primary" onClick={() => send({ type: 'playAgain' })}>
            Play again
          </Button>
        ) : (
          <Text tone="muted">The host can start a new game.</Text>
        )}
        <Button variant="ghost" onClick={() => send({ type: 'leaveRoom' })}>
          Leave room
        </Button>
      </div>
    </Modal>
  );
}
