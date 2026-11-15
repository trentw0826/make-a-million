export type RuleErrorCode =
  | 'GAME_OVER'
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'NOT_ELIGIBLE_FOR_MISDEAL'
  | 'MUST_OPEN'
  | 'BID_TOO_LOW'
  | 'BID_NOT_MULTIPLE'
  | 'DISCARD_COUNT'
  | 'DISCARD_DUPLICATE'
  | 'DISCARD_NOT_IN_HAND'
  | 'DISCARD_SPECIAL'
  | 'DISCARD_MONEY_WHILE_NUMBERS'
  | 'INVALID_TRUMP'
  | 'CARD_NOT_IN_HAND'
  | 'CANNOT_LEAD_SPECIAL'
  | 'MUST_FOLLOW_SUIT'
  | 'INVALID_ACTION';

export interface RuleError {
  readonly code: RuleErrorCode;
  readonly message: string;
}

export function ruleError(code: RuleErrorCode, message: string): RuleError {
  return { code, message };
}

export class RuleViolation extends Error {
  readonly code: RuleErrorCode;
  constructor(error: RuleError) {
    super(`${error.code}: ${error.message}`);
    this.name = 'RuleViolation';
    this.code = error.code;
  }
}
