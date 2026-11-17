import { type Seat, type TableView, teamOf } from '@mam/engine';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { shortMoney } from '../format';
import { highBid } from '../hints';
import { type Spot, spotOf } from '../spots';

/** Where the stake rests on the felt: the middle while nobody has bid, else before the bidder. */
const REST: Readonly<Record<Spot | 'middle', { left: string; top: string }>> = {
  middle: { left: '50%', top: '50%' },
  bottom: { left: '50%', top: '76%' },
  left: { left: '20%', top: '50%' },
  top: { left: '50%', top: '24%' },
  right: { left: '80%', top: '50%' },
};

/**
 * The auction, told by the felt alone: one plaque with the standing bid, lying in front of
 * whoever holds it. It waits in the middle at the opening amount until someone bids, then
 * slides over to each new high bidder in turn. Seats carry no labels while the auction runs;
 * a seat that has passed just fades back.
 */
export function BidStake({ view, me }: { view: TableView; me: Seat }) {
  const still = useReducedMotion() ?? false;
  const bidding = view.phase === 'bidding';
  const high = highBid(view.auction);
  const at = REST[high ? spotOf(high.seat, me) : 'middle'];
  const amount = high?.amount ?? view.ruleset.bidding.minOpeningBid;
  const side = high ? (teamOf(high.seat) === view.team ? 'us' : 'them') : 'open';

  return (
    <AnimatePresence>
      {bidding && (
        <motion.div
          key="stake"
          className={`bid-stake stake-${side}`}
          aria-hidden="true"
          initial={still ? false : { opacity: 0, scale: 0.8, ...at }}
          animate={{ opacity: 1, scale: 1, ...at }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 150, damping: 22 }}
        >
          <span className="stake-label">{high ? 'High bid' : 'Opens at'}</span>
          <motion.span
            key={amount}
            className="stake-amount"
            initial={still || !high ? false : { scale: 1.25 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 18 }}
          >
            {shortMoney(amount)}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
