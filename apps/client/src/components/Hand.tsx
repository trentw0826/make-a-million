import { type CardId, cardById, isTrump, type Suit } from '@mam/engine';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { type CSSProperties, type FocusEvent, useEffect, useMemo, useRef, useState } from 'react';
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
 * How far each card moves aside from the one under the pointer, by distance, in units of
 * --part-gap. The next card to the right moves a whole unit, enough to uncover the hovered
 * card, so it never has to jump to the front; those farther off move less, so the hand
 * parts around it. Cards to the left lie under the hovered card and ease away half as far.
 */
const PART_FALLOFF = [1, 0.7, 0.45, 0.25, 0.1];
const LEFT_SHARE = 0.5;

/** How far, in --part-gap units, the card at `i` moves aside when the card at `at` is hovered. */
export function partOffset(i: number, at: number): number {
  if (at < 0 || i === at) return 0;
  const f = PART_FALLOFF[Math.abs(i - at) - 1] ?? 0;
  return i > at ? f : -f * LEFT_SHARE;
}

/**
 * The player's own cards, fanned and grouped by color, the trump group first once it is
 * named. Mount a fresh Hand for each deal (key it by deal) so the cards are dealt in again:
 * each flies from the dealer face down and turns over as it lands. When the order changes
 * (trump named, a card played) the cards slide to their new places. A card you play shares
 * its layout id with its place on the felt (TrickArea), so it flies there; it stays mounted
 * while it leaves, because the view that drops it arrives just before the event that puts it
 * on the felt. Hovering or focusing a card raises it and parts the cards around it.
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
  // The card under the pointer or keyboard focus: it rises and the others part around it.
  const [hovered, setHovered] = useState<CardId | null>(null);
  const at = hovered === null ? -1 : order.indexOf(hovered);
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHovered(null);
  };

  return (
    <section
      className="hand"
      aria-label="Your hand"
      style={{ '--n': order.length } as CSSProperties}
      onPointerLeave={() => setHovered(null)}
      onBlur={onBlur}
    >
      <AnimatePresence mode="popLayout">
        {order.map((id, i) => {
          const prev = order[i - 1];
          const newGroup =
            prev !== undefined && displayGroup(prev, trump) !== displayGroup(id, trump);
          const from = dealt.current ? WIDOW_FROM : DEAL_FROM[dealer ?? 'top'];
          const delay = dealt.current ? 0 : (i * DEAL_STAGGER_MS) / 1000;
          const props = cardProps(id);
          // A picked card stays up; any other rises under the pointer, unless it can't be played.
          const raise = i === at && !props.selected && !props.disabled ? 1 : 0;
          const fan = {
            '--d': i - mid,
            '--part': partOffset(i, at),
            '--raise': raise,
            '--picked': props.selected ? 1 : 0,
          } as CSSProperties;
          return (
            <motion.div
              key={id}
              layout="position"
              layoutId={cardLayoutId(id)}
              exit={{ opacity: 0, transition: { duration: DUR_FAST_MS / 1000 } }}
              transition={{ layout: CARD_SPRING }}
              className={newGroup ? 'hand-slot group-start' : 'hand-slot'}
              onPointerEnter={(e) => {
                // A tap is a play, not a look: don't part the hand under a finger.
                if (e.pointerType !== 'touch') setHovered(id);
              }}
              onFocus={() => setHovered(id)}
            >
              <div className={i === at ? 'hand-fan hand-fan-hovered' : 'hand-fan'} style={fan}>
                <motion.div
                  className="card-3d"
                  initial={still ? false : { x: from.x, y: from.y, rotateY: 180, opacity: 0 }}
                  animate={{ x: 0, y: 0, rotateY: 0, opacity: 1 }}
                  transition={{ duration: DEAL_MS / 1000, delay, ease: EASE_OUT }}
                >
                  <CardFace
                    id={id}
                    {...props}
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
