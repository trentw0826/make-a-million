import type { Seat } from '@mam/engine';

/** Where a seat sits on screen. The viewer is always at the bottom. */
export type Spot = 'bottom' | 'left' | 'top' | 'right';

const SPOTS: readonly Spot[] = ['bottom', 'left', 'top', 'right'];

/** Where `seat` sits on screen, seen from `me`. */
export function spotOf(seat: Seat, me: Seat): Spot {
  return SPOTS[(seat - me + 4) % 4] ?? 'bottom';
}

/** Unit vectors from the middle of the felt toward each spot. */
export const TOWARD: Readonly<Record<Spot, readonly [number, number]>> = {
  bottom: [0, 1],
  left: [-1, 0],
  top: [0, -1],
  right: [1, 0],
};
