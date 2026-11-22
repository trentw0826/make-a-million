import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Text.module.css';

export interface TextProps extends HTMLAttributes<HTMLElement> {
  /** A step on the type scale (--text-*); by default the size around it. */
  readonly size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | undefined;
  /**
   * `muted` for secondary text; `good` and `bad` for gains and losses. Each takes the colour
   * that suits its surface: paper, or the felt.
   */
  readonly tone?: 'muted' | 'good' | 'bad' | undefined;
  readonly weight?: 'regular' | 'semibold' | 'bold' | undefined;
  /** A small uppercase label, spaced out. */
  readonly caps?: boolean | undefined;
  /** Even-width figures, for sums that line up or count up. */
  readonly numeric?: boolean | undefined;
  readonly as?: 'span' | 'p' | 'div' | 'strong' | 'small' | undefined;
  readonly children?: ReactNode;
}

/** Text set from the type scale, so a size or tone is a choice from a list, not a number. */
export function Text({
  size,
  tone,
  weight,
  caps = false,
  numeric = false,
  as: Tag = 'span',
  className,
  ...rest
}: TextProps) {
  const classes = [
    size && styles[`size-${size}`],
    tone && styles[tone],
    weight && styles[weight],
    caps && styles.caps,
    numeric && styles.numeric,
    className,
  ];
  return <Tag className={classes.filter(Boolean).join(' ') || undefined} {...rest} />;
}
