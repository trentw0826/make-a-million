import {
  type CardId,
  cardById,
  isNumberCard,
  type LegalMoves,
  SUITS,
  type TableView,
} from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { type ReactNode, useEffect, useState } from 'react';
import { nameOf, SUIT_NAMES, shortMoney } from '../format';
import { highBid, playHint, relation, waitingText } from '../hints';
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
    case 'misdeal':
      return <MisdealControls canCall={legal.canCall} threshold={view.ruleset.misdeal.threshold} />;
    case 'bid':
      return <BidControls legal={legal} view={view} room={room} />;
    case 'discard':
      return (
        <DiscardControls legal={legal} view={view} selected={selected} onDone={onClearSelection} />
      );
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

/** The bar while the table waits on this player: marked so it can't be missed. */
function TurnBar({ children }: { children: ReactNode }) {
  return (
    <div className="action-bar action-turn">
      <span className="turn-pill">Your turn</span>
      {children}
    </div>
  );
}

function MisdealControls({ canCall, threshold }: { canCall: boolean; threshold: number }) {
  const { act } = useGame();
  const ready = () => act({ type: 'declineMisdeal' });
  useGameKeys({ Enter: ready });
  return (
    <TurnBar>
      <span>Look at your hand.</span>
      {canCall && (
        <button type="button" className="warn-btn" onClick={() => act({ type: 'callMisdeal' })}>
          Call misdeal ({shortMoney(threshold)} or less)
        </button>
      )}
      <button type="button" className="primary" onClick={ready}>
        Ready to bid
      </button>
    </TurnBar>
  );
}

function BidControls({
  legal,
  view,
  room,
}: {
  legal: Extract<LegalMoves, { kind: 'bid' }>;
  view: TableView;
  room: RoomView;
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
  const high = highBid(view.auction);
  return (
    <TurnBar>
      <span>
        {high ? (
          <>
            High bid <strong>{shortMoney(high.amount)}</strong>: {nameOf(room, high.seat)} (
            {relation(view.seat, high.seat)})
          </>
        ) : legal.canPass ? (
          'No bids yet.'
        ) : (
          'You open the bidding.'
        )}
      </span>
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
    </TurnBar>
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
  const discard = () => {
    act({ type: 'discard', cardIds: chosen });
    onDone();
  };
  useGameKeys(ok ? { Enter: discard } : {});
  return (
    <TurnBar>
      <span>
        {view.widow ? 'The widow cards are marked new. ' : ''}Discard three cards
        {legal.requiredNumberCards > 0
          ? `, at least ${legal.requiredNumberCards} of them number cards`
          : ''}
        . <strong>{chosen.length}/3</strong> chosen.
      </span>
      <button type="button" className="primary" disabled={!ok} onClick={discard}>
        Discard
      </button>
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
