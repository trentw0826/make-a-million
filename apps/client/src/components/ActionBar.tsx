import {
  type CardId,
  cardById,
  isNumberCard,
  type LegalMoves,
  SUITS,
  type TableView,
} from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { SUIT_NAMES, shortMoney } from '../format';
import { playHint, waitingText } from '../hints';
import { useGame } from '../store';
import { useGameKeys } from '../useHotkeys';

interface Props {
  view: TableView;
  room: RoomView;
  selected: ReadonlySet<CardId>;
  onClearSelection: () => void;
}

/** The controls for whatever decision the seat faces right now. */
export function ActionBar({ view, room, selected, onClearSelection }: Props) {
  const legal = view.legal;
  switch (legal.kind) {
    case 'none':
      return <output className="action-bar muted">{waitingText(view, room)}</output>;
    case 'bid':
      return <BidControls legal={legal} view={view} />;
    case 'discard':
      return <DiscardControls legal={legal} selected={selected} onDone={onClearSelection} />;
    case 'trump':
      return <TrumpControls />;
    case 'play':
      return (
        <TurnBar>
          <span>{playHint(view)}</span>
        </TurnBar>
      );
    case 'continue':
      return null; // handled by the hand-result modal
  }
}

/**
 * The bar while the table waits on this player. The gold ring round your seat shows whose
 * turn it is, so only screen readers are told in words.
 */
function TurnBar({ children }: { children: ReactNode }) {
  return (
    <div className="action-bar action-turn">
      <span className="visually-hidden">Your turn.</span>
      {children}
    </div>
  );
}

/**
 * Bid or pass; on a first turn with a weak enough hand, call a misdeal instead. The high bid
 * is on the contract bar, so it isn't repeated here.
 */
function BidControls({
  legal,
  view,
}: {
  legal: Extract<LegalMoves, { kind: 'bid' }>;
  view: TableView;
}) {
  const { act } = useGame();
  const [amount, setAmount] = useState(legal.minBid);
  useEffect(() => setAmount(legal.minBid), [legal.minBid]);
  const step = legal.step;
  const lower = () => setAmount((a) => Math.max(legal.minBid, a - step));
  const raise = () => setAmount((a) => a + step);
  const bid = () => act({ type: 'bid', amount });
  useGameKeys({
    ArrowLeft: lower,
    ArrowDown: lower,
    ArrowRight: raise,
    ArrowUp: raise,
    Enter: bid,
  });
  const threshold = view.ruleset.misdeal.threshold;
  return (
    <TurnBar>
      {!legal.canPass && <span>You open the bidding.</span>}
      <div className="bid-stepper">
        <button
          type="button"
          onClick={lower}
          disabled={amount <= legal.minBid}
          aria-label="lower bid"
        >
          −
        </button>
        <strong className="bid-amount">{shortMoney(amount)}</strong>
        <button type="button" onClick={raise} aria-label="raise bid">
          +
        </button>
      </div>
      <button type="button" className="primary" onClick={bid} aria-keyshortcuts="Enter">
        Bid {shortMoney(amount)}
      </button>
      <button type="button" disabled={!legal.canPass} onClick={() => act({ type: 'pass' })}>
        Pass
      </button>
      {legal.canCallMisdeal && (
        <button
          type="button"
          className="warn-btn"
          title={`Your Money totals ${shortMoney(threshold)} or less: you may have the hand re-dealt instead of bidding.`}
          onClick={() => act({ type: 'callMisdeal' })}
        >
          Call misdeal
        </button>
      )}
    </TurnBar>
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
  const discard = () => {
    act({ type: 'discard', cardIds: chosen });
    onDone();
  };
  useGameKeys(ok ? { Enter: discard } : {});
  return (
    <TurnBar>
      <strong>Discard 3</strong>
      <button type="button" className="primary" disabled={!ok} onClick={discard}>
        Discard
      </button>
      <RulesTip label="Discard rules">
        The three widow cards are now in your hand, marked new. Choose three to put out of play for
        this hand. Number cards must go before Money; the Tiger, Bull and Bear can never be
        discarded.
      </RulesTip>
    </TurnBar>
  );
}

function TrumpControls() {
  const { act } = useGame();
  return (
    <TurnBar>
      <span>Name trump:</span>
      {SUITS.map((suit) => (
        <button
          type="button"
          key={suit}
          className={`suit-btn suit-${suit}`}
          onClick={() => act({ type: 'nameTrump', suit })}
        >
          {SUIT_NAMES[suit]}
        </button>
      ))}
    </TurnBar>
  );
}
