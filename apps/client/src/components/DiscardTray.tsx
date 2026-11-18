import { type CardId, cardById, isNumberCard, type LegalMoves } from '@mam/engine';
import { motion } from 'motion/react';
import { type ReactNode, useId } from 'react';
import { useGame } from '../store';
import { CARD_SPRING } from '../theme/motion';
import { useGameKeys } from '../useHotkeys';
import { CardFace } from './CardFace';
import { cardLayoutId } from './TrickArea';

const SLOTS = 3;

/**
 * Where the bidder discards, in the middle of the felt: three slots, counted in the label,
 * and the Discard button below them. A card picked in the hand flies here (it shares its
 * layout id with its place in the hand), and a click sends it back. The rules wait behind a
 * "?" at the last slot's corner.
 */
export function DiscardTray({
  ids,
  legal,
  onReturn,
  onDone,
}: {
  ids: readonly CardId[];
  legal: Extract<LegalMoves, { kind: 'discard' }>;
  onReturn: (id: CardId) => void;
  /** Called once the discard is sent, to clear the picks. */
  onDone: () => void;
}) {
  const { act } = useGame();
  const numbers = ids.filter((id) => isNumberCard(cardById(id))).length;
  const ok = ids.length === SLOTS && numbers >= legal.requiredNumberCards;
  const discard = () => {
    act({ type: 'discard', cardIds: [...ids] });
    onDone();
  };
  useGameKeys(ok ? { Enter: discard } : {});
  return (
    <section className="discard-tray" aria-label="Your discards">
      <p className="discard-tray-label">
        Discards ({ids.length}/{SLOTS})
      </p>
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
              {i === SLOTS - 1 && (
                <RulesTip label="Discard rules">
                  The three widow cards are now in your hand, outlined in gold. Choose three to put
                  out of play for this hand. Number cards must go before Money; the Tiger, Bull and
                  Bear can never be discarded.
                </RulesTip>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" className="primary discard-go" disabled={!ok} onClick={discard}>
        Discard
      </button>
    </section>
  );
}

/**
 * A quiet "?": hovering or focusing it (a tap, on a touch screen) shows the rules behind
 * the decision, which the table itself leaves out.
 */
function RulesTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="rules-tip">
      <button type="button" className="rules-tip-btn" aria-label={label} aria-describedby={id}>
        ?
      </button>
      <span id={id} role="tooltip" className="rules-tip-text">
        {children}
      </span>
    </span>
  );
}
