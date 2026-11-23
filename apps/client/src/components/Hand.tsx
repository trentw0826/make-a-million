import { type CardId, cardById, isTrump, type Suit } from '@mam/engine';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import {
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  /**
   * Choosing trump: a whole color group rises under the pointer and the other groups part
   * around it, as a single card does otherwise. Called with the color under the pointer or
   * focus, or null.
   */
  readonly onHoverColor?: ((suit: Suit | null) => void) | undefined;
  /** Choosing trump: a color pointed at elsewhere (its token on the felt), raised as if hovered. */
  readonly litColor?: Suit | null | undefined;
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
 * A card on its way out of the hand (played, or picked to discard) fades where it was for a
 * moment; it mustn't take a click meant for the card sliding into its place.
 */
function Present({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <div className="hand-present" inert={!present}>
      {children}
    </div>
  );
}

/**
 * The player's own cards, fanned and grouped by color, the trump group first once it is
 * named. Mount a fresh Hand for each deal (key it by deal) so the cards are dealt in again:
 * each flies from the dealer face down and turns over as it lands. When the order changes
 * (trump named, a card played) the cards slide to their new places. A card you play shares
 * its layout id with its place on the felt (TrickArea), so it flies there; it stays mounted
 * while it leaves, because the view that drops it arrives just before the event that puts it
 * on the felt. Hovering or focusing a card you can click raises it and parts the cards around
 * it; a card you can't click stays still.
 */
export function Hand({ ids, trump, dealer, cardProps, onHoverColor, litColor }: Props) {
  const order = useMemo(() => displayOrder(ids, trump), [ids, trump]);
  // The first render is the deal; cards that mount after it are the widow. A card that left
  // and comes back (a discard put back) flies home on its own, so it isn't dealt in again.
  const dealt = useRef(false);
  const seen = useRef(new Set<CardId>());
  useEffect(() => {
    dealt.current = true;
    for (const id of order) seen.current.add(id);
  });
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
  // Choosing trump, whole color groups rise and part instead of single cards.
  const byColor = onHoverColor !== undefined;
  const groups = useMemo(
    () => [...new Set(order.map((id) => displayGroup(id, trump)))],
    [order, trump],
  );
  const hoveredGroup = hovered === null ? null : displayGroup(hovered, trump);
  const hoveredColor = byColor && hoveredGroup !== 'special' ? hoveredGroup : null;
  useEffect(() => {
    onHoverColor?.(hoveredColor);
  }, [onHoverColor, hoveredColor]);
  // The color shown raised: the one under the pointer here, else one pointed at on the felt.
  const raisedColor = byColor ? (hoveredColor ?? litColor ?? null) : null;
  const atGroup = raisedColor === null ? -1 : groups.indexOf(raisedColor);

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
          // Choosing trump, the hovered card's whole color rises instead.
          const group = displayGroup(id, trump);
          // Only a card you can click answers the pointer: one you can't (greyed out on your
          // turn, or any card while you wait) stays still, and so does the hand around it.
          const live = props.onClick !== undefined && !props.disabled;
          const raise = byColor
            ? group === raisedColor
              ? 1
              : 0
            : i === at && !props.selected
              ? 1
              : 0;
          const part = byColor ? partOffset(groups.indexOf(group), atGroup) : partOffset(i, at);
          const fan = {
            '--d': i - mid,
            '--part': part,
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
                if (e.pointerType !== 'touch') setHovered(live ? id : null);
              }}
              onFocus={() => setHovered(live ? id : null)}
            >
              <Present>
                <div className={raise ? 'hand-fan hand-fan-hovered' : 'hand-fan'} style={fan}>
                  <motion.div
                    className="card-3d"
                    initial={
                      still || seen.current.has(id)
                        ? false
                        : { x: from.x, y: from.y, rotateY: 180, opacity: 0 }
                    }
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
              </Present>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </section>
  );
}
