import { type HandResult, otherTeam, type Team } from '@mam/engine';

/** What the bar needs of a hand: a full result, or a line of the score sheet. */
type Bid = Pick<HandResult, 'biddingTeam' | 'captured' | 'bid' | 'made'>;

import { motion } from 'motion/react';
import { money, shortMoney } from '../format';
import { AFTER_MODAL_MS, DUR_SLOWER_MS, EASE_OUT } from '../theme/motion';

/** How the bid went, in a few words: "made by $20k", "made exactly", "short by $35k". */
export function bidCaption(result: Bid): string {
  const margin = Math.abs(result.captured[result.biddingTeam] - result.bid);
  if (!result.made) return `short by ${shortMoney(margin)}`;
  return margin === 0 ? 'made exactly' : `made by ${shortMoney(margin)}`;
}

/**
 * A hand's Money on one bar, the viewer's side on the left: each side's capture slides in
 * from its own end, and a notch marks the bid, counted from the bidders' end. Used large in
 * the hand review and small on the score sheet (`compact`, without the bid's label).
 */
export function BidTrack({
  result,
  team,
  still,
  compact = false,
}: {
  result: Bid;
  team: Team;
  still: boolean;
  compact?: boolean;
}) {
  const bt = result.biddingTeam;
  const them = otherTeam(team);
  const scale = Math.max(result.captured[team] + result.captured[them], result.bid, 1);
  const pct = (n: number) => Math.min(100, (n / scale) * 100);
  const bidAt = bt === team ? pct(result.bid) : 100 - pct(result.bid);
  const grow = (n: number) => ({
    initial: still ? false : { width: '0%' },
    animate: { width: `${pct(n)}%` },
    transition: {
      duration: DUR_SLOWER_MS / 1000,
      ease: EASE_OUT,
      delay: compact ? 0 : AFTER_MODAL_MS / 1000,
    },
  });
  return (
    <div
      className={compact ? 'score-bar-track score-bar-compact' : 'score-bar-track'}
      role="img"
      aria-label={`The bidders captured ${money(result.captured[bt])} against a ${money(result.bid)} bid: ${bidCaption(result)}.`}
    >
      <motion.span className="score-bar-fill side-us" {...grow(result.captured[team])} />
      <motion.span
        className="score-bar-fill score-bar-right side-them"
        {...grow(result.captured[them])}
      />
      <span className="score-bar-notch" style={{ left: `${bidAt}%` }}>
        {!compact && <span className="score-bar-bid">Bid {shortMoney(result.bid)}</span>}
      </span>
    </div>
  );
}
