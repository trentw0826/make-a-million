import {
  type CardId,
  cardById,
  isNumberCard,
  type LegalMoves,
  type Suit,
  type TableView,
} from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { type ReactNode, useId } from 'react';
import { SUIT_NAMES } from '../format';
import { playHint, waitingText } from '../hints';
import { useGame } from '../store';
import { useGameKeys } from '../useHotkeys';

interface Props {
  view: TableView;
  room: RoomView;
  selected: ReadonlySet<CardId>;
  onClearSelection: () => void;
  /** Choosing trump: the color the pointer is on in the hand. */
  trumpPreview?: Suit | null;
}

/** The controls for whatever decision the seat faces right now. */
export function ActionBar({ view, room, selected, onClearSelection, trumpPreview = null }: Props) {
  const legal = view.legal;
  switch (legal.kind) {
    case 'none':
      // Whose turn it is shows on the table (the ring round the seat), so the bar says
      // nothing while you wait; screen readers still hear it. Through the auction there is
      // no bar at all, since the bidding happens on the felt (BidPlaques); later it holds its
      // space unseen, so your hand doesn't jump.
      return (
        <>
          {view.phase !== 'bidding' && (
            <div className="action-bar action-hidden" aria-hidden="true" />
          )}
          <output className="visually-hidden">{waitingText(view, room)}</output>
        </>
      );
    case 'bid':
      // Your plaque on the felt is the bid button, with − and + and Pass round it.
      return <output className="visually-hidden">Your turn to bid.</output>;
    case 'discard':
      return <DiscardControls legal={legal} selected={selected} onDone={onClearSelection} />;
    case 'trump':
      return <TrumpControls legal={legal} view={view} preview={trumpPreview} />;
    case 'play':
      // The cards you can't play are dimmed, each saying why on hover, so the bar stays
      // empty (held unseen, as while you wait); screen readers still hear the hint.
      return (
        <>
          <div className="action-bar action-hidden" aria-hidden="true" />
          <output className="visually-hidden">Your turn. {playHint(view)}</output>
        </>
      );
    case 'continue':
      // The hand-result dialog asks; the bar holds its space so the table doesn't shift.
      return <div className="action-bar action-hidden" aria-hidden="true" />;
  }
}

/**
 * The bar while the table waits on this player. The gold ring round your seat shows whose
 * turn it is, so only screen readers are told in words.
 */
function TurnBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className ? `action-bar action-turn ${className}` : 'action-bar action-turn'}>
      <span className="visually-hidden">Your turn.</span>
      {children}
    </div>
  );
}

/**
 * A quiet "?" in the corner of the action bar: hovering or focusing it (a tap, on a touch
 * screen) shows the rules behind the decision, which the bar itself leaves out.
 */
function RulesTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="rules-tip">
      <button type="button" className="rules-tip-btn" aria-label={label} aria-describedby={id}>
        ?
      </button>
      <span id={id} role="tooltip" className="rules-tip-text">
        {children}
      </span>
    </span>
  );
}

function DiscardControls({
  legal,
  selected,
  onDone,
}: {
  legal: Extract<LegalMoves, { kind: 'discard' }>;
  selected: ReadonlySet<CardId>;
  onDone: () => void;
}) {
  const { act } = useGame();
  const chosen = [...selected];
  const numbers = chosen.filter((id) => isNumberCard(cardById(id))).length;
  const ok = chosen.length === 3 && numbers >= legal.requiredNumberCards;
  const left = 3 - chosen.length;
  const discard = () => {
    act({ type: 'discard', cardIds: chosen });
    onDone();
  };
  useGameKeys(ok ? { Enter: discard } : {});
  return (
    <TurnBar>
      <button type="button" className="primary" disabled={!ok} onClick={discard}>
        {left > 0 ? `Discard (${left} left)` : 'Discard'}
      </button>
      <RulesTip label="Discard rules">
        The three widow cards are now in your hand, outlined in gold. Choose three to put out of play for
        this hand. Number cards must go before Money; the Tiger, Bull and Bear can never be
        discarded.
      </RulesTip>
    </TurnBar>
  );
}

/**
 * Naming trump is done in the hand: pointing at a color raises its cards, and a click names
 * it. The bar says what is being asked and which color is about to be named; any color the
 * hand has none of can still be named here.
 */
function TrumpControls({
  legal,
  view,
  preview,
}: {
  legal: Extract<LegalMoves, { kind: 'trump' }>;
  view: TableView;
  preview: Suit | null;
}) {
  const { act } = useGame();
  const held = new Set(
    view.hand.map((id) => cardById(id)).flatMap((c) => (c.kind === 'suit' ? [c.suit] : [])),
  );
  const missing = legal.suits.filter((s) => !held.has(s));
  return (
    <TurnBar className="trump-bar">
      {/* One badge, its blank filled with the color under the pointer. */}
      <output className="trump-badge">
        Choose{' '}
        {preview ? (
          <span key={preview} className={`trump-word suit-${preview}`}>
            {SUIT_NAMES[preview].toLowerCase()}
          </span>
        ) : (
          <span className="trump-blank">
            <span className="visually-hidden">a color</span>
          </span>
        )}{' '}
        as trump
      </output>
      {missing.length > 0 && (
        <span className="trump-missing">
          <span className="muted small">or:</span>
          {missing.map((suit) => (
            <button
              type="button"
              key={suit}
              className={`ghost small suit-btn suit-${suit}`}
              onClick={() => act({ type: 'nameTrump', suit })}
            >
              {SUIT_NAMES[suit]}
            </button>
          ))}
        </span>
      )}
    </TurnBar>
  );
}
