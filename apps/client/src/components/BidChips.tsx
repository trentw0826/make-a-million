import type { LegalMoves, Seat, TableView } from '@mam/engine';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { shortMoney } from '../format';
import { hasPassed, highBid } from '../hints';
import { type Spot, spotOf } from '../spots';
import { useGame } from '../store';
import { POP_IN, SETTLE_SPRING } from '../theme/motion';
import { useGameKeys } from '../useHotkeys';
import { MoveValue } from './analysis/Analysis';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';
import { Text } from './ui/Text';

const SEATS: readonly Seat[] = [0, 1, 2, 3];

/**
 * The auction, told on the felt: each player still in it has a chip in front of them,
 * reading "No bid" until they bid and then their bid. The standing high bid is drawn like the
 * contract badge it will become. A player who passes is out, and their chip goes. On your
 * turn your spot holds your bid controls instead.
 */
export function BidChips({ view, me }: { view: TableView; me: Seat }) {
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
              className={`bid-spot bid-spot-${spot}`}
              initial={still ? false : POP_IN.initial}
              animate={POP_IN.animate}
              exit={still ? { opacity: 0 } : POP_IN.initial}
              transition={SETTLE_SPRING}
            >
              {yours ? (
                <YourBid legal={legal} view={view} />
              ) : (
                <BidChip spot={spot} amount={amount} high={isHigh} />
              )}
            </motion.div>
          );
        })}
    </AnimatePresence>
  );
}

function BidChip({ spot, amount, high }: { spot: Spot; amount: number | null; high: boolean }) {
  const state = amount === null ? 'bid-chip-none' : high ? 'bid-chip-high' : 'bid-chip-topped';
  return (
    <span className={`bid-chip ${state}`} data-spot={spot} aria-hidden="true">
      {amount === null ? 'No bid' : shortMoney(amount)}
    </span>
  );
}

/**
 * Your bid controls on your turn: the amount between − and +, then Pass and Bid. Arrow keys
 * step the amount, Enter bids. On a first turn with a weak enough hand, "Call misdeal" joins
 * them.
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
    <Panel tone="felt" pad="sm" className="your-bid">
      <fieldset className="your-bid-fields" aria-label="Your bid">
        <div className="bid-stepper">
          <Button
            variant="ghost"
            shape="square"
            className="bid-step"
            onClick={lower}
            disabled={amount <= legal.minBid}
            aria-label="lower bid"
          >
            −
          </Button>
          <output className="bid-amount">
            <Text size="xl" weight="bold" numeric>
              {shortMoney(amount)}
            </Text>
          </output>
          <Button
            variant="ghost"
            shape="square"
            className="bid-step"
            onClick={raise}
            aria-label="raise bid"
          >
            +
          </Button>
        </div>
        <div className="bid-actions">
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
            className="bid-pass"
            disabled={!legal.canPass}
            title={legal.canPass ? undefined : 'You open the bidding, so you must bid.'}
            onClick={() => act({ type: 'pass' })}
          >
            Pass
            <MoveValue action={{ type: 'pass' }} />
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="bid-submit"
            onClick={bid}
            aria-label={`Bid ${shortMoney(amount)}`}
            aria-keyshortcuts="Enter"
          >
            Bid
            {/* The analysis values bidding the minimum only; a higher bid commits more. */}
            {amount === legal.minBid && <MoveValue action={{ type: 'bid', amount }} />}
          </Button>
        </div>
      </fieldset>
    </Panel>
  );
}
