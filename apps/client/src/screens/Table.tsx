import {
  type CardId,
  cardById,
  isNumberCard,
  nextSeat,
  partnerOf,
  type TableView,
} from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { useEffect, useState } from 'react';
import { ActionBar } from '../components/ActionBar';
import { ContractBar } from '../components/ContractBar';
import { EventLog } from '../components/EventLog';
import { GameOver } from '../components/GameOver';
import { Hand } from '../components/Hand';
import { HandResult } from '../components/HandResult';
import { ScoreSheet } from '../components/ScoreSheet';
import { SeatPanel } from '../components/SeatPanel';
import { TrickArea } from '../components/TrickArea';
import { blockedReason, isMyTurn, seatChip } from '../hints';
import { useGame } from '../store';
import { useTurnTitle } from '../useTurnTitle';

/** How long a finished trick lies on the felt before it is gathered (a new lead cuts it short). */
const TRICK_HOLD_MS = 1100;
/** How long gathering takes; matches the trick-sweep animation in styles.css. */
const TRICK_SWEEP_MS = 350;

export function Table({ room, view }: { room: RoomView; view: TableView }) {
  const { state, act, dispatch } = useGame();
  const me = view.seat;
  const [selected, setSelected] = useState<ReadonlySet<CardId>>(new Set());
  const myTurn = isMyTurn(view);
  useTurnTitle(myTurn);

  // The finished trick lies on the table for a moment, then slides to its winner.
  const completed = state.completedTrick;
  useEffect(() => {
    if (!completed) return;
    const ms = completed.stage === 'hold' ? TRICK_HOLD_MS : TRICK_SWEEP_MS;
    const timer = setTimeout(() => dispatch({ kind: 'advanceCompletedTrick' }), ms);
    return () => clearTimeout(timer);
  }, [completed, dispatch]);

  // Selection only matters while discarding.
  useEffect(() => {
    if (view.legal.kind !== 'discard') setSelected(new Set());
  }, [view.legal.kind]);

  const legalPlays = view.legal.kind === 'play' ? new Set(view.legal.cardIds) : null;
  const discarding = view.legal.kind === 'discard';
  const forbidden =
    view.legal.kind === 'discard' ? new Set(view.legal.forbiddenIds) : new Set<CardId>();
  // Money may be discarded only once the number cards run out, so lock Money cards that
  // could not legally complete the discard instead of letting the button silently refuse.
  const isNumber = (id: CardId) => isNumberCard(cardById(id));
  const moneyAllowed = Math.max(0, 3 - view.hand.filter(isNumber).length);
  const moneySelected = [...selected].filter((id) => !isNumber(id)).length;
  const canSelect = (id: CardId) =>
    !forbidden.has(id) && (selected.has(id) || isNumber(id) || moneySelected < moneyAllowed);
  // The widow is in view only for the bidder; mark its cards while they choose discards.
  const widow = new Set(discarding ? (view.widow ?? []) : []);

  const onCard = (id: CardId) => {
    if (legalPlays) {
      if (legalPlays.has(id)) act({ type: 'playCard', cardId: id });
      return;
    }
    if (discarding && canSelect(id)) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else if (next.size < 3) next.add(id);
        return next;
      });
    }
  };

  const seatedHuman = room.seats[me]?.kind === 'human';
  const myChip = seatChip(view, me);

  return (
    <main className="table-screen">
      <aside className="side">
        <ScoreSheet view={view} room={room} />
        <EventLog entries={state.log} />
      </aside>

      <section className="felt">
        <ContractBar view={view} room={room} />
        <SeatPanel seat={partnerOf(me)} room={room} view={view} position="top" />
        <SeatPanel seat={nextSeat(me)} room={room} view={view} position="left" />
        <SeatPanel seat={nextSeat(partnerOf(me))} room={room} view={view} position="right" />
        <TrickArea me={me} room={room} view={view} plays={state.trickPlays} completed={completed} />

        <div className={myTurn ? 'me me-turn' : 'me'}>
          <ActionBar
            view={view}
            room={room}
            selected={selected}
            onClearSelection={() => setSelected(new Set())}
          />
          <Hand
            ids={view.hand}
            trump={view.trump}
            cardProps={(id) => {
              const disabled = legalPlays
                ? !legalPlays.has(id)
                : discarding
                  ? !canSelect(id)
                  : false;
              return {
                selected: selected.has(id),
                disabled,
                onClick: legalPlays || discarding ? () => onCard(id) : undefined,
                fresh: widow.has(id),
                title: disabled ? blockedReason(id, view) : undefined,
              };
            }}
          />
          <div className="me-line side-us">
            <span className="side-dot" aria-hidden="true" />
            You
            {view.dealer === me && <span className="tag">dealer</span>}
            {view.contract?.bidder === me && <span className="tag">bidder</span>}
            {myChip && <span className={`seat-chip chip-${myChip.kind}`}>{myChip.text}</span>}
          </div>
        </div>
      </section>

      {view.phase === 'hand-complete' && view.result && (
        <HandResult result={view.result} room={room} team={view.team} canContinue={seatedHuman} />
      )}
      {view.phase === 'game-over' && <GameOver view={view} room={room} />}
    </main>
  );
}
