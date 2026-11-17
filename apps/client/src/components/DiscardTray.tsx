import type { CardId } from '@mam/engine';
import { motion } from 'motion/react';
import { CARD_SPRING } from '../theme/motion';
import { CardFace } from './CardFace';
import { cardLayoutId } from './TrickArea';

const SLOTS = 3;

/**
 * Where the bidder lays out their discards, in the middle of the felt: three slots. A card
 * picked in the hand flies here (it shares its layout id with its place in the hand), and a
 * click sends it back.
 */
export function DiscardTray({
  ids,
  onReturn,
}: {
  ids: readonly CardId[];
  onReturn: (id: CardId) => void;
}) {
  return (
    <section className="discard-tray" aria-label="Your discards">
      <p className="discard-tray-label">Discards</p>
      <div className="discard-slots">
        {Array.from({ length: SLOTS }, (_, i) => {
          const id = ids[i];
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: the slots are fixed places
            <div key={i} className="discard-slot">
              {id !== undefined && (
                <motion.div
                  layoutId={cardLayoutId(id)}
                  transition={{ layout: CARD_SPRING }}
                  className="discard-card"
                >
                  <CardFace id={id} onClick={() => onReturn(id)} title="Put it back in your hand" />
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
