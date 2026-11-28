import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Badge.module.css';

/** A move's grade from the solo analysis, best to worst, and a move that had no choice. */
export type GradeTone =
  | 'grade-best'
  | 'grade-good'
  | 'grade-inaccuracy'
  | 'grade-mistake'
  | 'grade-blunder'
  | 'grade-forced';

export type BadgeTone =
  | 'neutral'
  | 'quiet'
  | 'shade'
  | 'paper'
  | 'contract'
  | 'accent'
  | 'good'
  | 'bad'
  | 'warn'
  | GradeTone;

export interface BadgeProps extends HTMLAttributes<HTMLElement> {
  /**
   * - `neutral`: a quiet patch in the colour of the text around it (a "host" tag). The default.
   * - `quiet`: the same, with muted text: something empty or waiting ("No bid").
   * - `shade`: a dark patch with paper text, for the felt (a topped bid, a move's value).
   * - `paper`: a paper chip on the felt.
   * - `contract`: paper, ringed in gold: the contract, and the high bid that would become it.
   * - `accent`: solid gold: what is live or won ("In play", "Winner").
   * - `good`, `bad`: how something went ("Made", "Set", ready).
   * - `warn`: someone away or reconnecting.
   * - `grade-*`: a move's grade in the solo analysis.
   */
  readonly tone?: BadgeTone | undefined;
  /** `sm` beside small text, `md` beside a name, `lg` standing alone on the felt. */
  readonly size?: 'sm' | 'md' | 'lg' | undefined;
  readonly as?: 'span' | 'li' | undefined;
  readonly children?: ReactNode;
}

/**
 * A short label in a pill: a status, a tag, a value. Every badge in the client is one of
 * these, so they share one shape, weight and set of tones. `data-tone` names the tone, for
 * tests and for anything that needs to tell one state from another.
 */
export function Badge({
  tone = 'neutral',
  size = 'sm',
  as: Tag = 'span',
  className,
  ...rest
}: BadgeProps) {
  const classes = [styles.badge, styles[tone], styles[size], className];
  return <Tag className={classes.filter(Boolean).join(' ')} data-tone={tone} {...rest} />;
}
