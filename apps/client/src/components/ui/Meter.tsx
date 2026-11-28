import type { HTMLAttributes } from 'react';
import styles from './Meter.module.css';

export interface MeterProps extends HTMLAttributes<HTMLDivElement> {
  /** How full, from 0 to 1; anything outside is clamped. */
  readonly value: number;
  /** Whose colour fills it: a side's, or gold for anything else. */
  readonly fill?: 'us' | 'them' | 'accent' | undefined;
  readonly size?: 'sm' | 'md' | undefined;
}

/**
 * A bar that fills from the left: a side's progress to the target, or any other share. Its
 * empty track takes the line colour of the surface it sits on (`--track`), so it suits the
 * felt and paper alike, and a change in value eases in. It is drawn for the eye: the number
 * it stands for should be written beside it, so it is hidden from screen readers.
 */
export function Meter({ value, fill = 'accent', size = 'sm', className, ...rest }: MeterProps) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  const classes = [styles.meter, styles[size], className];
  return (
    <div className={classes.filter(Boolean).join(' ')} aria-hidden="true" {...rest}>
      <span className={`${styles.fill} ${styles[fill]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
