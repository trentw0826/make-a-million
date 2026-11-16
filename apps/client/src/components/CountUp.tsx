import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { COUNT_UP_MS, EASE_OUT } from '../theme/motion';

/**
 * A sum of money that counts up from zero when it appears, the way chips are tallied. Screen
 * readers get the final amount at once; with reduced motion everyone does.
 */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const still = useReducedMotion() ?? false;
  const [shown, setShown] = useState(still ? value : 0);
  useEffect(() => {
    if (still) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, {
      duration: COUNT_UP_MS / 1000,
      ease: EASE_OUT,
      onUpdate: setShown,
    });
    return () => controls.stop();
  }, [value, still]);
  // Tally in whole thousands on the way, then land on the exact amount.
  const display = shown === value ? value : Math.round(shown / 1000) * 1000;
  return (
    <>
      <span aria-hidden="true" className="count-up">
        {format(display)}
      </span>
      <span className="visually-hidden">{format(value)}</span>
    </>
  );
}
