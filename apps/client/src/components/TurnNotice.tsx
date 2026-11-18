import type { TableView } from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { playHint, waitingText } from '../hints';

/**
 * Whose turn it is, and what is asked, in words for screen readers. On screen the table
 * shows it: the marker on the felt's rim and the ring round the name, and every decision is
 * made on the felt (the bid plaques, the discard tray, the trump picker) or in the hand.
 */
export function TurnNotice({ view, room }: { view: TableView; room: RoomView }) {
  const legal = view.legal;
  let text: string;
  switch (legal.kind) {
    case 'none':
      text = waitingText(view, room);
      break;
    case 'bid':
      text = 'Your turn to bid.';
      break;
    case 'discard':
      text = 'Your turn to discard.';
      break;
    case 'trump':
      text = 'Your turn to name trump.';
      break;
    case 'play':
      // The cards you can't play are dimmed, each saying why on hover.
      text = `Your turn. ${playHint(view)}`;
      break;
    case 'continue':
      // The hand-result dialog asks.
      return null;
  }
  return <output className="visually-hidden">{text}</output>;
}
