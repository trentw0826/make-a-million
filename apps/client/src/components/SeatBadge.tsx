import { motion } from 'motion/react';
import { SuitGlyph } from '../art/CardArt';
import { SUIT_NAMES } from '../format';
import type { SeatChip } from '../hints';
import { POP_IN, SETTLE_SPRING } from '../theme/motion';

/** The bidder's badge under their name once the auction is over: the contract, then trump. */
export function SeatBadge({ chip }: { chip: SeatChip | null }) {
  if (!chip) return null;
  return (
    <motion.span
      key={`${chip.kind}-${chip.text}`}
      className={`seat-chip chip-${chip.kind}`}
      initial={POP_IN.initial}
      animate={POP_IN.animate}
      transition={SETTLE_SPRING}
    >
      <span className="visually-hidden">Contract </span>
      {chip.text}
      {chip.trump && (
        <span className={`chip-trump suit-${chip.trump}`} data-trump-suit={chip.trump}>
          <SuitGlyph suit={chip.trump} className="chip-trump-glyph" />
          {SUIT_NAMES[chip.trump]}
        </span>
      )}
    </motion.span>
  );
}
