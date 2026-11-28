import type { HTMLAttributes, ReactNode, Ref } from 'react';
import styles from './Panel.module.css';

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  /**
   * - `paper`: a card of its own on the felt (the home screen's place card).
   * - `raised`: lifted a little off a paper surface (the race on the score sheet).
   * - `outlined`: one of a list on paper (a hand on the score sheet, a trick in the review).
   * - `felt`: a darker patch on the felt (a side's score).
   */
  readonly tone?: 'paper' | 'raised' | 'outlined' | 'felt' | undefined;
  readonly pad?: 'sm' | 'md' | 'lg' | undefined;
  readonly as?: 'div' | 'section' | 'li' | 'aside' | 'span' | 'output' | undefined;
  readonly children?: ReactNode;
  readonly ref?: Ref<HTMLElement> | undefined;
}

/**
 * A surface that holds a group of things: its background, edge, corners and padding come
 * from its tone, and Text inside it takes the colours that suit that surface.
 */
export function Panel({
  tone = 'paper',
  pad = 'md',
  as: Tag = 'div',
  className,
  ref,
  ...rest
}: PanelProps) {
  const classes = [styles.panel, styles[tone], styles[`pad-${pad}`], className];
  // Each element takes a ref to its own type; the caller holds a ref to any HTMLElement.
  return (
    <Tag
      ref={ref as Ref<never> | undefined}
      className={classes.filter(Boolean).join(' ')}
      {...rest}
    />
  );
}
