import type { CSSProperties } from 'react';
import styles from './Confetti.module.css';

const PIECES = 90;

/**
 * A value in [0, 1) that looks random but is the same every time, so a render is
 * repeatable. Each salt gives an unrelated sequence, so a piece's place, wait and fall
 * don't move in step (which would line the pieces up).
 */
const spread = (i: number, salt: number) => {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43_758.5453;
  return x - Math.floor(x);
};

/**
 * A single burst of confetti falling over the screen, once, for a won game. Each piece takes
 * its place, fall, sway and spin from its index; its colour comes from the stylesheet (the
 * four suits and gold). It never takes a click, and it is left out under reduced motion by
 * whoever shows it.
 */
export function Confetti() {
  return (
    <div className={styles.confetti} aria-hidden="true" data-testid="confetti">
      {Array.from({ length: PIECES }, (_, i) => {
        const style = {
          '--x': `${spread(i, 1) * 100}%`,
          '--wait': spread(i, 2).toFixed(3),
          '--speed': (0.8 + spread(i, 3) * 0.7).toFixed(3),
          '--drift': `${(spread(i, 4) - 0.5) * 30}vw`,
          '--spin': `${Math.round((spread(i, 5) - 0.5) * 1440)}deg`,
        } as CSSProperties;
        // biome-ignore lint/suspicious/noArrayIndexKey: the pieces are fixed, by index
        return <span key={i} className={styles.piece} style={style} />;
      })}
    </div>
  );
}
