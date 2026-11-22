import {
  type CardId,
  cardById,
  isNumberCard,
  nextSeat,
  otherTeam,
  partnerOf,
  type Suit,
  type TableView,
  teamOf,
} from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { LayoutGroup } from 'motion/react';
import { useEffect, useState } from 'react';
import {
  AnalysisToggle,
  EvalBar,
  MoveReview,
  MoveValue,
  useDecision,
} from '../components/analysis/Analysis';
import { ContractBar } from '../components/ContractBar';
import { DiscardTray } from '../components/DiscardTray';
import { GameOver } from '../components/GameOver';
import { Hand } from '../components/Hand';
import { HandResult } from '../components/HandResult';
import { ScoreTracker } from '../components/ScoreTracker';
import { SeatBadge } from '../components/SeatBadge';
import { SeatPanel } from '../components/SeatPanel';
import { TableDrawer } from '../components/TableDrawer';
import { HelpButton, SoundToggle } from '../components/TopBar';
import { TrickArea } from '../components/TrickArea';
import { TrickPile } from '../components/TrickPile';
import { TrumpPicker } from '../components/TrumpPicker';
import { TurnNotice } from '../components/TurnNotice';
import { UndoControls } from '../components/UndoControls';
import { blockedReason, hasPassed, isMyTurn, seatChip } from '../hints';
import { sound } from '../sound/player';
import { spotOf } from '../spots';
import { useGame } from '../store';
import { RESULT_PAUSE_MS, TRICK_HOLD_MS, TRICK_SWEEP_MS } from '../theme/motion';
import { useTurnTitle } from '../useTurnTitle';

export function Table({ room, view }: { room: RoomView; view: TableView }) {
  const { state, act, dispatch } = useGame();
  const me = view.seat;
  const [selected, setSelected] = useState<ReadonlySet<CardId>>(new Set());
  const myTurn = isMyTurn(view);
  useTurnTitle(myTurn);
  useEffect(() => {
    if (myTurn) sound.play('yourTurn');
  }, [myTurn]);

  // The finished trick lies on the table for a moment, then slides to its winner.
  const completed = state.completedTrick;
  useEffect(() => {
    if (!completed) return;
    const ms = completed.stage === 'hold' ? TRICK_HOLD_MS : TRICK_SWEEP_MS;
    const timer = setTimeout(() => dispatch({ kind: 'advanceCompletedTrick' }), ms);
    return () => clearTimeout(timer);
  }, [completed, dispatch]);

  // The hand review waits until the last trick has been gathered, then a moment more.
  const handOver = view.phase === 'hand-complete';
  const [reviewOpen, setReviewOpen] = useState(false);
  useEffect(() => {
    if (!handOver || completed) {
      setReviewOpen(false);
      return;
    }
    const timer = setTimeout(() => setReviewOpen(true), RESULT_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [handOver, completed]);

  // Selection only matters while discarding.
  useEffect(() => {
    if (view.legal.kind !== 'discard') setSelected(new Set());
  }, [view.legal.kind]);

  // Choosing trump: the color the pointer is on in the hand, lit in the picker on the felt.
  const naming = view.legal.kind === 'trump';
  const nameable = new Set<Suit>(view.legal.kind === 'trump' ? view.legal.suits : []);
  const [trumpPreview, setTrumpPreview] = useState<Suit | null>(null);
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
  // While discarding, the picked cards leave the hand for the discard tray on the felt; the
  // cards that must be kept stay in their places, greyed out.
  const handIds = discarding ? view.hand.filter((id) => !selected.has(id)) : view.hand;

  // Tooltips need a hover, which touch screens don't have, so a click on a greyed-out card
  // says why too.
  const showBlocked = (id: CardId) => {
    const reason = blockedReason(id, view);
    if (reason) dispatch({ kind: 'toast', toast: { kind: 'info', text: reason } });
  };

  const onCard = (id: CardId) => {
    const card = cardById(id);
    if (naming) {
      if (card.kind === 'suit' && nameable.has(card.suit)) {
        act({ type: 'nameTrump', suit: card.suit });
      }
      return;
    }
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

  const myChip = seatChip(view, me);
  // The analysis is still working on your decision.
  const decision = useDecision();
  const thinking = room.solo && room.analysis && myTurn && decision === null;
  const dealKey = `${view.handNumber}-${view.redeals}`;

  // Each side's taken tricks, in one pile beneath its score. The view counts a trick as soon
  // as it is won, but until it is gathered it lies on the felt; while it is gathered, it flies
  // into the winning side's pile.
  const pile = (side: 'us' | 'them') => {
    const team = side === 'us' ? view.team : otherTeam(view.team);
    const theirs = completed !== null && teamOf(completed.winner) === team;
    return (
      <TrickPile
        owner={side === 'us' ? 'Us' : 'Them'}
        side={side}
        count={Math.max(0, view.trickCounts[team] - (theirs ? 1 : 0))}
        incoming={theirs && completed?.stage === 'sweep' ? completed.plays : null}
      />
    );
  };
  const left = nextSeat(me);
  const top = partnerOf(me);
  const right = nextSeat(top);

  return (
    <main className="table-screen">
      <section className="felt">
        {/* The hand's status in words, for screen readers; on screen it is shown by the
            bid on the felt, the bidder's badge (with trump) and each side's pile. */}
        <ContractBar view={view} room={room} />
        <EvalBar thinking={thinking} />
        {/* One group per deal: a card you play flies from your hand to the felt, and on to
            the winners' pile, and ids never carry over from an earlier deal. */}
        <LayoutGroup id={dealKey}>
          {/* Each side's score in its own top corner, its taken tricks beneath it: ours on
              the left, theirs on the right. */}
          <ScoreTracker view={view} room={room} side="us" pile={pile('us')} />
          <ScoreTracker view={view} room={room} side="them" pile={pile('them')} />
          <div className="top-side">
            <SeatPanel seat={top} room={room} view={view} position="top" />
          </div>
          <div className="left-side">
            <SeatPanel seat={left} room={room} view={view} position="left" />
          </div>
          <div className="right-side">
            <SeatPanel seat={right} room={room} view={view} position="right" />
          </div>
          <TrickArea
            me={me}
            room={room}
            view={view}
            plays={state.trickPlays}
            completed={completed}
          />
          {view.legal.kind === 'trump' && (
            <TrumpPicker legal={view.legal} hand={view.hand} preview={trumpPreview} />
          )}
          {view.legal.kind === 'discard' && (
            <DiscardTray
              ids={[...selected]}
              legal={view.legal}
              onReturn={onCard}
              onDone={() => setSelected(new Set())}
              onPick={(ids) => setSelected(new Set(ids))}
            />
          )}

          <div
            className={['me', myTurn && 'me-turn', hasPassed(view, me) && 'seat-passed']
              .filter(Boolean)
              .join(' ')}
          >
            {/* Your name tag, as the other seats have theirs, with the contract badge if you
                hold it. */}
            <div className="seat-name me-name side-us">
              <span className="side-dot" aria-hidden="true" />
              You
              {hasPassed(view, me) && <span className="visually-hidden">, passed</span>}
              <SeatBadge chip={myChip} />
              <span className="me-review">
                <MoveReview />
              </span>
            </div>
            <TurnNotice view={view} room={room} />
            <Hand
              key={dealKey}
              ids={handIds}
              trump={view.trump}
              dealer={spotOf(view.dealer, me)}
              onHoverColor={naming ? setTrumpPreview : undefined}
              annotation={(id) =>
                legalPlays?.has(id) ? (
                  <MoveValue onCard action={{ type: 'playCard', cardId: id }} />
                ) : null
              }
              cardProps={(id) => {
                if (naming) {
                  // The Tiger, Bull and Bear have no color to name; they fade back.
                  const card = cardById(id);
                  const colored = card.kind === 'suit' && nameable.has(card.suit);
                  return {
                    selected: false,
                    disabled: !colored,
                    onClick: colored ? () => onCard(id) : undefined,
                  };
                }
                const disabled = legalPlays
                  ? !legalPlays.has(id)
                  : discarding
                    ? !canSelect(id)
                    : false;
                return {
                  selected: selected.has(id),
                  disabled,
                  onClick: legalPlays || discarding ? () => onCard(id) : undefined,
                  onBlockedClick: () => showBlocked(id),
                  fresh: widow.has(id),
                  title: disabled ? blockedReason(id, view) : undefined,
                };
              }}
            />
          </div>
        </LayoutGroup>
        <div className="table-corner">
          <TableDrawer view={view} room={room} log={state.log} />
          {room.solo && <AnalysisToggle compact />}
          {room.solo && <UndoControls room={room} />}
          <SoundToggle />
          <HelpButton icon />
        </div>
      </section>

      {handOver && reviewOpen && view.result && (
        <HandResult
          result={view.result}
          room={room}
          team={view.team}
          seat={me}
          pending={view.continuePending}
        />
      )}
      {view.phase === 'game-over' && <GameOver view={view} room={room} />}
    </main>
  );
}
