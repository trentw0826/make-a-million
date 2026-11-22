import type { ButtonHTMLAttributes, Ref } from 'react';
import styles from './Button.module.css';
import { PRESSABLE } from './pressable';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * - `primary`: the one main action in view (gold).
   * - `secondary`: any other action (paper). The default.
   * - `ghost`: a quiet action; an outline in the colour of the text around it, so it suits the
   *   felt and paper alike.
   * - `danger`: an action that loses something (leaving, a misdeal).
   * - `link`: reads as a link inside a sentence.
   */
  readonly variant?: ButtonVariant | undefined;
  readonly size?: 'sm' | 'md' | undefined;
  /** `square` and `round` are icon buttons, --icon-btn-size across; give them an aria-label. */
  readonly shape?: 'rect' | 'pill' | 'square' | 'round' | undefined;
  readonly ref?: Ref<HTMLButtonElement> | undefined;
}

/**
 * Every ordinary button in the client. The look of each variant, and how every button answers
 * the pointer, a press and the keyboard, is decided once, here. Game pieces that are buttons
 * (cards, the trump tokens) keep their own look.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  shape = 'rect',
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    PRESSABLE,
    styles[variant],
    size === 'sm' && styles.sm,
    shape !== 'rect' && styles[shape],
    className,
  ];
  return <button type={type} className={classes.filter(Boolean).join(' ')} {...rest} />;
}
