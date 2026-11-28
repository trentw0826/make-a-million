import { type CardId, cardById, isNumberCard, type LegalMoves } from '@mam/engine';
import { motion } from 'motion/react';
import { type ReactNode, useId } from 'react';
import { useGame } from '../store';
import { CARD_SPRING } from '../theme/motion';
import { useGameKeys } from '../useHotkeys';
import { SuggestedDiscards } from './analysis/Analysis';
import { CardFace } from './CardFace';
import { cardLayoutId } from './TrickArea';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';

const SLOTS = 3;

/**
 * Where the bidder discards, in the middle of the felt: three slots and, below them, the
 * Discard button, which counts down the picks still to make ("Discard 2 More") and can't be
 * pressed until all three are in. A card picked in the hand flies here (it shares its
 * layout id with its place in the hand), and a click sends it back. The rules wait behind a
 * "?" at the last slot's corner.
 */
export function DiscardTray({
  ids,
  legal,
  onReturn,
  onDone,
  onPick,
}: {
  ids: readonly CardId[];
  legal: Extract<LegalMoves, { kind: 'discard' }>;
  onReturn: (id: CardId) => void;
  /** Called once the discard is sent, to clear the picks. */
  onDone: () => void;
  /** Picks these three in the hand (a suggested discard, with the analysis on). */
  onPick?: (ids: readonly CardId[]) => void;
}) {
  const { act } = useGame();
  const numbers = ids.filter((id) => isNumberCard(cardById(id))).length;
  const ok = ids.length === SLOTS && numbers >= legal.requiredNumberCards;
  const left = SLOTS - ids.length;
  const discard = () => {
    act({ type: 'discard', cardIds: [...ids] });
    onDone();
  };
  useGameKeys(ok ? { Enter: discard } : {});
  return (
    <section className="discard-tray" aria-label="Your discards">
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
      <Button variant="primary" className="discard-go" disabled={!ok} onClick={discard}>
        {left > 0 ? `Discard ${left} More` : 'Discard'}
      </Button>
      {onPick && <SuggestedDiscards onPick={onPick} />}
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
      <Button
        variant="ghost"
        shape="round"
        className="rules-tip-btn"
        aria-label={label}
        aria-describedby={id}
      >
        ?
      </Button>
      <Panel as="span" tone="paper" pad="sm" id={id} role="tooltip" className="rules-tip-text">
        {children}
      </Panel>
    </span>
  );
}
