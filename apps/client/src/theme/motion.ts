/**
 * Motion timings for script, mirroring the `--dur-*` and `--ease-*` tokens in tokens.css.
 * Every animation the table runs takes its timing from here, so the timers that wait on an
 * animation (the trick hold and sweep in Table.tsx) can never drift from it.
 */

export const DUR_FAST_MS = 120;
export const DUR_BASE_MS = 200;
export const DUR_SLOW_MS = 360;

/** The `--ease-out` curve, as Motion's cubic-bezier array. */
export const EASE_OUT = [0.2, 0.7, 0.3, 1] as const;

/** A springy settle for cards: quick, with a little overshoot. */
export const CARD_SPRING = { type: 'spring', stiffness: 520, damping: 34, mass: 0.9 } as const;

/** How long a finished trick lies on the felt before it is gathered (a new lead cuts it short). */
export const TRICK_HOLD_MS = 1100;
/** How long gathering a trick to its winner takes. */
export const TRICK_SWEEP_MS = 350;
/** How long a played card takes to reach the felt. */
export const TRICK_ENTER_MS = 320;

/** Dealing: time for one card to arrive, and the gap between cards. */
export const DEAL_MS = 420;
export const DEAL_STAGGER_MS = 45;
