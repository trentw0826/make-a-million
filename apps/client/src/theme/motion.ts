/**
 * Motion timings for script, mirroring the `--dur-*` and `--ease-*` tokens in tokens.css.
 * Every animation the table runs takes its timing from here, so the timers that wait on an
 * animation (the trick hold and sweep in Table.tsx) can never drift from it.
 */

export const DUR_FAST_MS = 120;
export const DUR_BASE_MS = 200;
export const DUR_SLOW_MS = 360;
/** Motion meant to be watched: a bar filling, sparks flying. */
export const DUR_SLOWER_MS = 800;
/** One step of a ticking countdown (`--dur-tick`): the ring moves linearly between ticks. */
export const DUR_TICK_MS = 100;

/** The `--ease-out` curve, as Motion's cubic-bezier array. */
export const EASE_OUT = [0.2, 0.7, 0.3, 1] as const;
/** The `--ease-in-out` curve: for something that starts and ends at rest (a card turning over). */
export const EASE_IN_OUT = [0.42, 0, 0.58, 1] as const;

/*
 * Springs. Every spring in the client is one of these; pick by feel, and add a preset here
 * rather than tuning stiffness and damping at a call site.
 */

/** A springy settle for cards: quick, with a little overshoot. */
export const CARD_SPRING = { type: 'spring', stiffness: 520, damping: 34, mass: 0.9 } as const;
/** Something arriving and settling without a bounce (a bid chip, a seat's badge). */
export const SETTLE_SPRING = { type: 'spring', stiffness: 320, damping: 24 } as const;
/** A lively bounce, to draw the eye (a raised bid, the hand's outcome). */
export const POP_SPRING = { type: 'spring', stiffness: 380, damping: 18 } as const;
/** A slow, smooth glide over a long way (the turn marker round the felt's rim). */
export const GLIDE_SPRING = { type: 'spring', stiffness: 170, damping: 24 } as const;

/** Appearing: from slightly small and clear to full size. Pair with a spring above. */
export const POP_IN = {
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1 },
} as const;

/** How long a played card takes to reach the felt. */
export const TRICK_ENTER_MS = 320;
/** After it touches down, how long a played card slides before friction stops it. */
export const TRICK_SKID_MS = 300;
/** How long a finished trick lies still on the felt, once its last card has come to rest. */
export const TRICK_DIGEST_MS = 900;
/**
 * How long a finished trick stays on the felt before it is gathered, counted from its last
 * card being played: that card's arrival, then time to take the trick in. The server rests
 * longer than this and the sweep together before a bot leads (`trickPauseMs`), so only a
 * human leading straight away cuts it short.
 */
export const TRICK_HOLD_MS = TRICK_ENTER_MS + TRICK_SKID_MS + TRICK_DIGEST_MS;
/** How long gathering a trick to its winner takes. */
export const TRICK_SWEEP_MS = 350;
/**
 * After the last trick of a hand has been gathered, how long the table rests before the
 * hand review opens over it, so the end of the hand can sink in.
 */
export const RESULT_PAUSE_MS = 1500;
/** How far it slides, in px. */
export const TRICK_SKID_PX = 16;
/** A thrown card's flight: it leaves the hand gently and is still moving when it lands. */
export const FLIGHT_EASE = [0.35, 0.25, 0.65, 0.85] as const;
/** Sliding to a stop: fast at first, then friction takes it to rest. */
export const SKID_EASE = [0.15, 0.6, 0.35, 1] as const;

/** How long a sum takes to count up on the hand result. */
export const COUNT_UP_MS = 900;

/** Dealing: time for one card to arrive, and the gap between cards. */
export const DEAL_MS = 420;
export const DEAL_STAGGER_MS = 45;
/** The fan on the home table deals in more slowly, after a moment's pause. */
export const SHOWCASE_DELAY_MS = 100;
export const SHOWCASE_STAGGER_MS = 90;

/**
 * Something inside a modal that should start once the modal has risen in (the modal's own
 * `rise-in` takes `--dur-base`).
 */
export const AFTER_MODAL_MS = DUR_BASE_MS;

/** How long the review of a move you made stays beside your name (it then fades). */
export const REVIEW_LINGER_MS = 5000;
