import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Heading.module.css';

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  /** The heading's place in the outline (h1–h4). It says nothing about its size. */
  readonly level: 1 | 2 | 3 | 4;
  /** A step on the type scale. By default: 3xl, 2xl, lg, md for levels 1 to 4. */
  readonly size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | undefined;
  readonly children?: ReactNode;
}

const DEFAULT_SIZE = { 1: '3xl', 2: '2xl', 3: 'lg', 4: 'md' } as const;

/**
 * A heading in the display face. It brings no margin of its own: the layout around it sets
 * the space, so a heading looks the same in a modal, a drawer or a card.
 */
export function Heading({ level, size, className, ...rest }: HeadingProps) {
  const Tag = `h${level}` as const;
  const classes = [styles.heading, styles[`size-${size ?? DEFAULT_SIZE[level]}`], className];
  return <Tag className={classes.filter(Boolean).join(' ')} {...rest} />;
}
