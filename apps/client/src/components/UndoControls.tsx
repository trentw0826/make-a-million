import type { RoomView } from '@mam/protocol';
import { useGame } from '../store';
import { useUndoKeys } from '../useHotkeys';
import { Icon } from './Icon';
import { Button } from './ui/Button';

/**
 * Solo: take back your last decision, or replay the one taken back (also Ctrl+Z and
 * Ctrl+Shift+Z). The server rebuilds the game; these only ask.
 */
export function UndoControls({ room }: { room: RoomView }) {
  const { send } = useGame();
  const undo = () => {
    if (room.canUndo) send({ type: 'undo' });
  };
  const redo = () => {
    if (room.canRedo) send({ type: 'redo' });
  };
  useUndoKeys({ undo, redo });
  return (
    <>
      <Button
        variant="ghost"
        shape="square"
        aria-label="Undo your last move"
        title="Undo your last move (Ctrl+Z)"
        aria-keyshortcuts="Control+Z Meta+Z"
        disabled={!room.canUndo}
        onClick={undo}
      >
        <Icon name="undo" />
      </Button>
      <Button
        variant="ghost"
        shape="square"
        aria-label="Redo"
        title="Redo (Ctrl+Shift+Z)"
        aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
        disabled={!room.canRedo}
        onClick={redo}
      >
        <Icon name="redo" />
      </Button>
    </>
  );
}
