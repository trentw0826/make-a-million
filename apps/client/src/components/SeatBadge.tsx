import { motion } from 'motion/react';
import { SuitGlyph } from '../art/CardArt';
import { SUIT_NAMES } from '../format';
import type { SeatChip } from '../hints';

/** The bidder's badge under their name once the auction is over: the contract, then trump. */
export function SeatBadge({ chip }: { chip: SeatChip | null }) {
  if (!chip) return null;
  return (
    <motion.span
      key={`${chip.kind}-${chip.text}`}
      className={`seat-chip chip-${chip.kind}`}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 24 }}
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
