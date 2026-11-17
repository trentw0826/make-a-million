import {
  type CardId,
  cardById,
  isNumberCard,
  nextSeat,
  partnerOf,
  type Seat,
  type Suit,
  type TableView,
  teamOf,
} from '@mam/engine';
import type { RoomView } from '@mam/protocol';
import { LayoutGroup } from 'motion/react';
import { useEffect, useState } from 'react';
import { ActionBar } from '../components/ActionBar';
import { ContractBar } from '../components/ContractBar';
import { GameOver } from '../components/GameOver';
import { Hand } from '../components/Hand';
import { HandResult } from '../components/HandResult';
import { Scoreboard } from '../components/Scoreboard';
import { SeatPanel } from '../components/SeatPanel';
import { TableDrawer } from '../components/TableDrawer';
import { HelpButton, SoundToggle } from '../components/TopBar';
import { TrickArea } from '../components/TrickArea';
import { TrickPile } from '../components/TrickPile';
import { nameOf } from '../format';
import { blockedReason, hasPassed, isMyTurn, seatChip } from '../hints';
import { sound } from '../sound/player';
import { spotOf } from '../spots';
import { useGame } from '../store';
import { TRICK_HOLD_MS, TRICK_SWEEP_MS } from '../theme/motion';
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

  // Selection only matters while discarding.
  useEffect(() => {
    if (view.legal.kind !== 'discard') setSelected(new Set());
  }, [view.legal.kind]);

  // Choosing trump: the color the pointer is on in the hand, shown in the bar.
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

  // Your own bid stays under your hand only while it is the high one: once outbid, it is no
  // longer in play. A pass stays, since it is final.
  const chip = seatChip(view, me);
  const myChip = chip?.kind === 'bid' ? null : chip;
  const dealKey = `${view.handNumber}-${view.redeals}`;

  // Each player's taken tricks, in a pile on their left as they face the table. The view
  // counts a trick as soon as it is won, but until it is gathered it lies on the felt; while
  // it is gathered, it flies into its winner's pile.
  const pile = (seat: Seat, className: string) => {
    const theirs = completed !== null && completed.winner === seat;
    return (
      <TrickPile
        owner={seat === me ? 'Your' : `${nameOf(room, seat)}'s`}
        side={teamOf(seat) === view.team ? 'us' : 'them'}
        count={Math.max(0, view.tricksWon[seat] - (theirs ? 1 : 0))}
        incoming={theirs && completed?.stage === 'sweep' ? completed.plays : null}
        className={className}
      />
    );
  };
  const left = nextSeat(me);
  const top = partnerOf(me);
  const right = nextSeat(top);

  return (
    <main className="table-screen">
      <section className="felt">
        <ContractBar view={view} room={room} />
        <Scoreboard view={view} room={room} />
        {/* One group per deal: a card you play flies from your hand to the felt, and on to
            the winners' pile, and ids never carry over from an earlier deal. */}
        <LayoutGroup id={dealKey}>
          {/* Each pile lies on its player's left as they face the middle: your partner's to
              their right on screen, the left player's above them, the right player's below. */}
          <div className="top-side">
            <SeatPanel seat={top} room={room} view={view} position="top" />
            {pile(top, 'pile-top')}
          </div>
          <div className="left-side">
            {pile(left, 'pile-left')}
            <SeatPanel seat={left} room={room} view={view} position="left" />
          </div>
          <div className="right-side">
            <SeatPanel seat={right} room={room} view={view} position="right" />
            {pile(right, 'pile-right')}
          </div>
          <TrickArea
            me={me}
            room={room}
            view={view}
            plays={state.trickPlays}
            completed={completed}
          />

          <div
            className={['me', myTurn && 'me-turn', hasPassed(view, me) && 'seat-passed']
              .filter(Boolean)
              .join(' ')}
          >
            <ActionBar
              view={view}
              room={room}
              selected={selected}
              onClearSelection={() => setSelected(new Set())}
              trumpPreview={naming ? trumpPreview : null}
            />
            <Hand
              key={dealKey}
              ids={view.hand}
              trump={view.trump}
              dealer={spotOf(view.dealer, me)}
              onHoverColor={naming ? setTrumpPreview : undefined}
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
            <div className="me-line side-us">
              {myChip && <span className={`seat-chip chip-${myChip.kind}`}>{myChip.text}</span>}
            </div>
          </div>
          {/* Your tricks lie to your left. */}
          {pile(me, 'pile-me')}
        </LayoutGroup>
        <div className="table-corner">
          <TableDrawer view={view} room={room} log={state.log} />
          <SoundToggle />
          <HelpButton icon />
        </div>
      </section>

      {view.phase === 'hand-complete' && view.result && (
        <HandResult
          result={view.result}
          room={room}
          team={view.team}
          seat={me}
          pending={view.continuePending}
          target={view.ruleset.targetScore}
        />
      )}
      {view.phase === 'game-over' && <GameOver view={view} room={room} />}
    </main>
  );
}
