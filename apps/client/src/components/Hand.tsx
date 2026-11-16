import { type CardId, cardById, isTrump, type Suit } from '@mam/engine';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { type CSSProperties, useEffect, useMemo, useRef } from 'react';
import { CardBackArt } from '../art/CardBackArt';
import { displayGroup, displayOrder } from '../handOrder';
import type { Spot } from '../spots';
import { CARD_SPRING, DEAL_MS, DEAL_STAGGER_MS, DUR_FAST_MS, EASE_OUT } from '../theme/motion';
import { CardFace, type CardFaceProps } from './CardFace';
import { cardLayoutId } from './TrickArea';

interface Props {
  readonly ids: readonly CardId[];
  readonly trump: Suit | null;
  /** Where the dealer sits, so the deal flies in from there. */
  readonly dealer?: Spot | undefined;
  /** Per-card state from the table: selection, legality, widow mark, tooltip. */
  readonly cardProps: (id: CardId) => Omit<CardFaceProps, 'id' | 'trump'>;
}

/** Offsets from the hand to each dealer's seat, roughly, for the deal to start from. */
const DEAL_FROM: Readonly<Record<Spot, { x: number; y: number }>> = {
  top: { x: 0, y: -420 },
  left: { x: -520, y: -240 },
  right: { x: 520, y: -240 },
  bottom: { x: 0, y: 140 },
};
/** Cards that join later (the widow) come up from the middle of the felt. */
const WIDOW_FROM = { x: 0, y: -260 };

/**
 * The player's own cards, fanned and grouped by color, the trump group first once it is
 * named. Mount a fresh Hand for each deal (key it by deal) so the cards are dealt in again:
 * each flies from the dealer face down and turns over as it lands. When the order changes
 * (trump named, a card played) the cards slide to their new places. A card you play shares
 * its layout id with its place on the felt (TrickArea), so it flies there; it stays mounted
 * while it leaves, because the view that drops it arrives just before the event that puts it
 * on the felt.
 */
export function Hand({ ids, trump, dealer, cardProps }: Props) {
  const order = useMemo(() => displayOrder(ids, trump), [ids, trump]);
  // The first render is the deal; cards that mount after it are the widow.
  const dealt = useRef(false);
  useEffect(() => {
    dealt.current = true;
  }, []);
  const mid = (order.length - 1) / 2;
  // With reduced motion, cards simply appear where they belong: no start pose, not even for
  // a frame.
  const still = useReducedMotion() ?? false;

  return (
    <section
      className="hand"
      aria-label="Your hand"
      style={{ '--n': order.length } as CSSProperties}
    >
      <AnimatePresence mode="popLayout">
        {order.map((id, i) => {
          const prev = order[i - 1];
          const newGroup =
            prev !== undefined && displayGroup(prev, trump) !== displayGroup(id, trump);
          const from = dealt.current ? WIDOW_FROM : DEAL_FROM[dealer ?? 'top'];
          const delay = dealt.current ? 0 : (i * DEAL_STAGGER_MS) / 1000;
          return (
            <motion.div
              key={id}
              layout="position"
              layoutId={cardLayoutId(id)}
              exit={{ opacity: 0, transition: { duration: DUR_FAST_MS / 1000 } }}
              transition={{ layout: CARD_SPRING }}
              className={newGroup ? 'hand-slot group-start' : 'hand-slot'}
            >
              <div className="hand-fan" style={{ '--d': i - mid } as CSSProperties}>
                <motion.div
                  className="card-3d"
                  initial={still ? false : { x: from.x, y: from.y, rotateY: 180, opacity: 0 }}
                  animate={{ x: 0, y: 0, rotateY: 0, opacity: 1 }}
                  transition={{ duration: DEAL_MS / 1000, delay, ease: EASE_OUT }}
                >
                  <CardFace
                    id={id}
                    {...cardProps(id)}
                    trump={trump !== null && isTrump(cardById(id), trump)}
                  />
                  <div className="card-3d-back" aria-hidden="true">
                    <CardBackArt />
                  </div>
                </motion.div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </section>
  );
}
