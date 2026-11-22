import type { Action } from '@mam/engine';
import type { AnalysisDecision } from '@mam/protocol';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { shortMoney } from '../../format';
import { useGame } from '../../store';
import { DUR_BASE_MS, GLIDE_SPRING, REVIEW_LINGER_MS } from '../../theme/motion';
import { Button } from '../ui/Button';
import styles from './Analysis.module.css';
import { describeAction, LABEL_TEXT, optionFor, valueText } from './describe';

/**
 * The solo analysis as the table shows it. Everything comes from the server's analysis of
 * your own seat (see "Solo rooms" in docs/multiplayer.md); nothing here works anything out.
 */

/** The analysis is on, in a solo room. */
export function useAnalysisOn(): boolean {
  const { state } = useGame();
  return state.room?.solo === true && state.room.analysis;
}

/** The values of your decision in the position on the table, once they have arrived. */
export function useDecision(): AnalysisDecision | null {
  const { state } = useGame();
  return useAnalysisOn() ? state.analysis.decision : null;
}

/**
 * Your side's chance of winning the game, as a bar down the felt's left edge: gold (yours)
 * from the bottom, blue (theirs) above.
 */
export function EvalBar({ thinking }: { thinking: boolean }) {
  const { state } = useGame();
  const on = useAnalysisOn();
  if (!on) return null;
  const chance = state.analysis.winChance;
  const pct = chance === null ? 50 : Math.round(chance * 100);
  return (
    <div className={styles.bar} aria-busy={thinking}>
      {/* Read out as a meter; the bar drawn below is for the eye. */}
      <meter
        className="visually-hidden"
        aria-label="Your side's chance of winning"
        min={0}
        max={100}
        value={pct}
        aria-valuetext={chance === null ? 'Analysing' : `${pct}%`}
      />
      <span className={`${styles.pct} ${styles.them}`} aria-hidden="true">
        {chance === null ? '' : `${100 - pct}%`}
      </span>
      <div className={styles.track} aria-hidden="true">
        <motion.div
          className={styles.fill}
          initial={false}
          animate={{ height: `${pct}%` }}
          transition={GLIDE_SPRING}
        />
      </div>
      <span
        className={`${styles.pct} ${styles.us} ${thinking ? styles.thinking : ''}`}
        aria-hidden="true"
      >
        {chance === null ? '…' : `${pct}%`}
      </span>
    </div>
  );
}

/**
 * What one of your choices is worth against the best, as a chip: "Best" or "−$12k". Nothing
 * while the analysis is off, still working, or has no value for that choice.
 */
export function MoveValue({ action, onCard = false }: { action: Action; onCard?: boolean }) {
  const decision = useDecision();
  if (!decision) return null;
  const option = optionFor(decision, action);
  if (!option) return null;
  const text = valueText(decision, option);
  const best = text === 'Best';
  // On a card only a sliver shows in the fan, so the chip drops the dollar sign ("−12k").
  const chip = (
    <span
      className={`${styles.chip} ${best ? styles.best : ''}`}
      title={
        best
          ? 'The best choice here, by the analysis'
          : `Worth ${text.replace('−', '')} less this hand than the best choice`
      }
    >
      {onCard ? text.replace('$', '') : text}
    </span>
  );
  // Beside a word ("Pass Best"), with its own space, so a control without one reads as before.
  return onCard ? <span className={styles.onCard}>{chip}</span> : <> {chip}</>;
}

/**
 * How your last move compared with the best, beside your name for a few seconds; screen
 * readers hear it once.
 */
export function MoveReview() {
  const { state } = useGame();
  const on = useAnalysisOn();
  const review = on ? state.review : null;
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!review) return;
    setShown(review.id);
    const timer = setTimeout(() => setShown(null), REVIEW_LINGER_MS);
    return () => clearTimeout(timer);
  }, [review]);
  const visible = review !== null && shown === review.id;
  const details: string[] = [];
  if (review && review.lossK >= 1) details.push(shortMoney(-review.lossK * 1000));
  if (review && review.label !== 'best' && review.label !== 'forced') {
    details.push(`best was ${describeAction(review.best)}`);
  }
  return (
    <span role="status" aria-live="polite">
      <AnimatePresence>
        {visible && review && (
          <motion.span
            key={review.id}
            className={styles.review}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR_BASE_MS / 1000 }}
          >
            <span className={`${styles.label} ${styles[`label-${review.label}`]}`}>
              {LABEL_TEXT[review.label]}
            </span>
            {details.length > 0 && <span>{details.join(' · ')}</span>}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** The analysis switch, for the table's corner and the solo lobby. */
export function AnalysisToggle({ compact = false }: { compact?: boolean }) {
  const { state, send } = useGame();
  const on = state.room?.analysis === true;
  return (
    <Button
      variant={compact ? 'ghost' : 'secondary'}
      size={compact ? 'sm' : undefined}
      aria-pressed={on}
      title="Your chance of winning, what each choice is worth, and how each move compares"
      onClick={() => send({ type: 'setAnalysis', on: !on })}
    >
      Analysis: {on ? 'on' : 'off'}
    </Button>
  );
}

/** The best few discards, each a click away from being picked in the hand. */
export function SuggestedDiscards({ onPick }: { onPick: (ids: readonly number[]) => void }) {
  const decision = useDecision();
  if (decision?.kind !== 'discard') return null;
  return (
    <div className={styles.suggestions}>
      <p className="felt-label">Suggested discards</p>
      {decision.options.map((o) =>
        o.action.type === 'discard' ? (
          <Button
            key={o.action.cardIds.join()}
            variant="ghost"
            size="sm"
            onClick={() => o.action.type === 'discard' && onPick(o.action.cardIds)}
          >
            {describeAction(o.action).replace(/^discarding /, '')} <MoveValue action={o.action} />
          </Button>
        ) : null,
      )}
    </div>
  );
}
