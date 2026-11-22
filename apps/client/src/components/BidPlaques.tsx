import type { LegalMoves, Seat, TableView } from '@mam/engine';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { shortMoney } from '../format';
import { hasPassed, highBid } from '../hints';
import { type Spot, spotOf } from '../spots';
import { useGame } from '../store';
import { POP_IN, POP_SPRING, SETTLE_SPRING } from '../theme/motion';
import { useGameKeys } from '../useHotkeys';
import { MoveValue } from './analysis/Analysis';
import { Button } from './ui/Button';
import { PRESSABLE } from './ui/pressable';

const SEATS: readonly Seat[] = [0, 1, 2, 3];

/**
 * The auction, told on the felt: each player still in it has a plaque in front of them,
 * reading "No bid" until they bid and then their bid. The standing high bid glows. A player
 * who passes is out, and their plaque goes. On your turn your own plaque is the bid button,
 * with − and + either side of it and Pass below.
 */
export function BidPlaques({ view, me }: { view: TableView; me: Seat }) {
  const still = useReducedMotion() ?? false;
  const bidding = view.phase === 'bidding';
  const high = highBid(view.auction);
  const legal = view.legal;

  return (
    <AnimatePresence>
      {bidding &&
        SEATS.filter((seat) => !hasPassed(view, seat)).map((seat) => {
          const spot = spotOf(seat, me);
          const last = view.auction.findLast((e) => e.seat === seat);
          const amount = last?.kind === 'bid' ? last.amount : null;
          const isHigh = high !== null && high.seat === seat;
          const yours = seat === me && legal.kind === 'bid';
          return (
            <motion.div
              key={seat}
              className={`plaque-spot plaque-${spot}`}
              initial={still ? false : POP_IN.initial}
              animate={POP_IN.animate}
              exit={still ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
              transition={SETTLE_SPRING}
            >
              {yours ? (
                <YourBid legal={legal} view={view} />
              ) : (
                <Plaque spot={spot} amount={amount} high={isHigh} still={still} />
              )}
            </motion.div>
          );
        })}
    </AnimatePresence>
  );
}

function Plaque({
  spot,
  amount,
  high,
  still,
}: {
  spot: Spot;
  amount: number | null;
  high: boolean;
  still: boolean;
}) {
  const classes = ['plaque', amount === null ? 'plaque-none' : 'plaque-bid'];
  if (high) classes.push('plaque-high');
  return (
    <div className={classes.join(' ')} data-spot={spot} aria-hidden="true">
      <motion.span
        key={amount ?? 'none'}
        className="plaque-amount"
        initial={still || amount === null ? false : { scale: 1.3 }}
        animate={{ scale: 1 }}
        transition={POP_SPRING}
      >
        {amount === null ? 'No bid' : shortMoney(amount)}
      </motion.span>
    </div>
  );
}

/**
 * Your plaque on your turn: the bid button, its amount on its face, with − and + either side
 * of it and Pass beneath. Arrow keys step the amount, Enter bids. On a first turn with a weak
 * enough hand, "Call misdeal" sits beside Pass.
 */
function YourBid({
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
    <fieldset className="your-bid" aria-label="Your bid">
      <Button
        shape="round"
        className="plaque-step plaque-lower"
        onClick={lower}
        disabled={amount <= legal.minBid}
        aria-label="lower bid"
      >
        −
      </Button>
      <button
        type="button"
        className={`plaque plaque-yours ${PRESSABLE}`}
        onClick={bid}
        aria-keyshortcuts="Enter"
      >
        <span className="plaque-verb">Bid</span>{' '}
        <span className="plaque-amount">{shortMoney(amount)}</span>
        {/* The analysis values bidding the minimum only; a higher bid commits more. */}
        {amount === legal.minBid && <MoveValue action={{ type: 'bid', amount }} />}
      </button>
      <Button
        shape="round"
        className="plaque-step plaque-raise"
        onClick={raise}
        aria-label="raise bid"
      >
        +
      </Button>
      <div className="plaque-below">
        {legal.canCallMisdeal && (
          <Button
            variant="danger"
            size="sm"
            title={`Your Money totals ${shortMoney(threshold)} or less: you may have the hand re-dealt instead of bidding.`}
            onClick={() => act({ type: 'callMisdeal' })}
          >
            Call misdeal
            <MoveValue action={{ type: 'callMisdeal' }} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="plaque-pass"
          disabled={!legal.canPass}
          title={legal.canPass ? undefined : 'You open the bidding, so you must bid.'}
          onClick={() => act({ type: 'pass' })}
        >
          Pass
          <MoveValue action={{ type: 'pass' }} />
        </Button>
      </div>
    </fieldset>
  );
}
