import {
  type CardId,
  cardById,
  isNumberCard,
  type LegalMoves,
  SUITS,
  type TableView,
} from '@mam/engine';
import { useEffect, useState } from 'react';
import { money, SUIT_NAMES, shortMoney } from '../format';
import { useGame } from '../store';
import { useGameKeys } from '../useHotkeys';

interface Props {
  view: TableView;
  selected: ReadonlySet<CardId>;
  onClearSelection: () => void;
}

/** The controls for whatever decision the seat faces right now. */
export function ActionBar({ view, selected, onClearSelection }: Props) {
  const legal = view.legal;
  switch (legal.kind) {
    case 'none':
      return <div className="action-bar muted">{waitingText(view)}</div>;
    case 'misdeal':
      return <MisdealControls canCall={legal.canCall} threshold={view.ruleset.misdeal.threshold} />;
    case 'bid':
      return <BidControls legal={legal} />;
    case 'discard':
      return (
        <DiscardControls legal={legal} view={view} selected={selected} onDone={onClearSelection} />
      );
    case 'trump':
      return <TrumpControls />;
    case 'play':
      return <div className="action-bar">Your turn — choose a card to play.</div>;
    case 'continue':
      return null; // handled by the hand-result modal
  }
}

function waitingText(view: TableView): string {
  switch (view.phase) {
    case 'misdeal-window':
      return 'Waiting for the other players to look at their hands…';
    case 'bidding':
      return 'Bidding in progress…';
    case 'discarding':
      return 'The bidder is choosing discards…';
    case 'naming-trump':
      return 'The bidder is naming trump…';
    case 'playing':
      return 'Waiting for the other players…';
    default:
      return '';
  }
}

function MisdealControls({ canCall, threshold }: { canCall: boolean; threshold: number }) {
  const { act } = useGame();
  const ready = () => act({ type: 'declineMisdeal' });
  useGameKeys({ Enter: ready });
  return (
    <div className="action-bar">
      <span>Look at your hand.</span>
      {canCall && (
        <button type="button" className="warn-btn" onClick={() => act({ type: 'callMisdeal' })}>
          Call misdeal ({shortMoney(threshold)} or less)
        </button>
      )}
      <button type="button" className="primary" onClick={ready}>
        Ready to bid
      </button>
    </div>
  );
}

function BidControls({ legal }: { legal: Extract<LegalMoves, { kind: 'bid' }> }) {
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
  return (
    <div className="action-bar">
      <span>{legal.canPass ? 'Your bid' : 'You must open the bidding'}</span>
      <div className="bid-stepper">
        <button
          type="button"
          onClick={lower}
          disabled={amount <= legal.minBid}
          aria-label="lower bid"
        >
          −
        </button>
        <strong className="bid-amount">{money(amount)}</strong>
        <button type="button" onClick={raise} aria-label="raise bid">
          +
        </button>
      </div>
      <button type="button" className="primary" onClick={bid} aria-keyshortcuts="Enter">
        Bid {money(amount)}
      </button>
      <button type="button" disabled={!legal.canPass} onClick={() => act({ type: 'pass' })}>
        Pass
      </button>
    </div>
  );
}

function DiscardControls({
  legal,
  view,
  selected,
  onDone,
}: {
  legal: Extract<LegalMoves, { kind: 'discard' }>;
  view: TableView;
  selected: ReadonlySet<CardId>;
  onDone: () => void;
}) {
  const { act } = useGame();
  const chosen = [...selected];
  const numbers = chosen.filter((id) => isNumberCard(cardById(id))).length;
  const ok = chosen.length === 3 && numbers >= legal.requiredNumberCards;
  const widowNote = view.widow ? `You picked up ${view.widow.length} widow cards.` : '';
  const discard = () => {
    act({ type: 'discard', cardIds: chosen });
    onDone();
  };
  useGameKeys(ok ? { Enter: discard } : {});
  return (
    <div className="action-bar">
      <span>
        {widowNote} Discard three cards
        {legal.requiredNumberCards > 0
          ? ` — at least ${legal.requiredNumberCards} must be number cards`
          : ''}
        . Selected {chosen.length}/3.
      </span>
      <button type="button" className="primary" disabled={!ok} onClick={discard}>
        Discard
      </button>
    </div>
  );
}

function TrumpControls() {
  const { act } = useGame();
  return (
    <div className="action-bar">
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
    </div>
  );
}
