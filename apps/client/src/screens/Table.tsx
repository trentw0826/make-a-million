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
import { CardFace } from '../components/CardFace';
import { EventLog } from '../components/EventLog';
import { GameOver } from '../components/GameOver';
import { HandResult } from '../components/HandResult';
import { ScoreSheet } from '../components/ScoreSheet';
import { SeatPanel } from '../components/SeatPanel';
import { TrickArea } from '../components/TrickArea';
import { useGame } from '../store';

const TRICK_LINGER_MS = 1800;

export function Table({ room, view }: { room: RoomView; view: TableView }) {
  const { state, act, send, dispatch } = useGame();
  const me = view.seat;
  const [selected, setSelected] = useState<ReadonlySet<CardId>>(new Set());

  // Keep the finished trick on the table for a moment, as the winner gathers it.
  const completed = state.completedTrick;
  useEffect(() => {
    if (!completed) return;
    const timer = setTimeout(() => dispatch({ kind: 'clearCompletedTrick' }), TRICK_LINGER_MS);
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
  const connection = state.connection;

  return (
    <main className="table-screen">
      <aside className="side">
        <div className="room-line">
          <strong>Room {room.code}</strong>
          <span className={`conn conn-${connection}`}>{connection}</span>
          <button type="button" className="ghost small" onClick={() => send({ type: 'leaveRoom' })}>
            Leave
          </button>
        </div>
        <ScoreSheet view={view} room={room} />
        <EventLog entries={state.log} />
      </aside>

      <section className="felt">
        <SeatPanel seat={partnerOf(me)} room={room} view={view} position="top" />
        <SeatPanel seat={nextSeat(me)} room={room} view={view} position="left" />
        <SeatPanel seat={nextSeat(partnerOf(me))} room={room} view={view} position="right" />
        <TrickArea me={me} room={room} view={view} completed={completed} />

        <div className="me">
          <ActionBar
            view={view}
            selected={selected}
            onClearSelection={() => setSelected(new Set())}
          />
          <section className="hand" aria-label="Your hand">
            {view.hand.map((id) => (
              <CardFace
                key={id}
                id={id}
                selected={selected.has(id)}
                disabled={legalPlays ? !legalPlays.has(id) : discarding ? !canSelect(id) : false}
                onClick={legalPlays || discarding ? () => onCard(id) : undefined}
              />
            ))}
          </section>
          <div className="me-line muted small">
            You are seat {me + 1}
            {view.dealer === me ? ' · dealer' : ''}
            {view.contract?.bidder === me ? ' · bidder' : ''}
          </div>
        </div>
      </section>

      {view.phase === 'hand-complete' && view.result && (
        <HandResult result={view.result} room={room} canContinue={seatedHuman} />
      )}
      {view.phase === 'game-over' && <GameOver view={view} room={room} />}
    </main>
  );
}
