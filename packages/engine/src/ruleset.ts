/**
 * House-rule parameters. The deployed application uses DEFAULT_RULESET; tests and
 * simulations may pass variants.
 */
export interface Ruleset {
  readonly bidding: {
    /** Lowest legal opening bid. */
    readonly minOpeningBid: number;
    /** Each raise must exceed the previous bid by at least this much. Official: $10k. */
    readonly raiseIncrement: number;
    /** Every bid must be a multiple of this. */
    readonly bidStep: number;
    /** The player left of the dealer must open rather than pass. */
    readonly openerMustBid: boolean;
  };
  readonly misdeal: {
    readonly enabled: boolean;
    /** A hand whose Money totals this or less may be redealt. */
    readonly threshold: number;
  };
  /** First team to reach this cumulative score wins. */
  readonly targetScore: number;
  /** When both sides reach the target with equal scores. */
  readonly tieBreak: 'bidding-team' | 'play-on';
}

export const DEFAULT_RULESET: Ruleset = {
  bidding: {
    minOpeningBid: 175_000,
    raiseIncrement: 10_000,
    bidStep: 5_000,
    openerMustBid: true,
  },
  misdeal: {
    enabled: true,
    threshold: 15_000,
  },
  targetScore: 1_000_000,
  tieBreak: 'bidding-team',
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export function makeRuleset(overrides: DeepPartial<Ruleset> = {}): Ruleset {
  return {
    bidding: { ...DEFAULT_RULESET.bidding, ...overrides.bidding },
    misdeal: { ...DEFAULT_RULESET.misdeal, ...overrides.misdeal },
    targetScore: overrides.targetScore ?? DEFAULT_RULESET.targetScore,
    tieBreak: overrides.tieBreak ?? DEFAULT_RULESET.tieBreak,
  };
}
