import { createGame, type Seat, SUITS } from '@mam/engine';
import { describe, expect, it } from 'vitest';
import { heuristicContract } from '../src/contract/simulate';
import { CONTRACT_FEATURE_COUNT, CONTRACT_FEATURES, contractFeatures } from '../src/contract/value';

const MONEY_K = [0, 0, 0, 0, 5, 0, 0, 0, 10, 0, 15, 30, 40];
const at = (name: (typeof CONTRACT_FEATURES)[number], x: Float64Array) =>
  x[CONTRACT_FEATURES.indexOf(name)] as number;

describe('contract features', () => {
  it('describe the declaring team and its opponents consistently', () => {
    for (let i = 0; i < 20; i++) {
      const hand = createGame({ seed: `features-${i}` }).hand;
      if (!hand) throw new Error('no hand');
      const deal = { hands: hand.hands, widow: hand.widow };
      const declarer = (i % 4) as Seat;
      const x = contractFeatures(deal, declarer);
      expect(x).toHaveLength(CONTRACT_FEATURE_COUNT);
      expect([...x].every(Number.isFinite)).toBe(true);
      expect(at('bias', x)).toBe(1);
      const { keep, trump } = heuristicContract([...(hand.hands[declarer] ?? []), ...hand.widow]);
      const discarded = [...(hand.hands[declarer] ?? []), ...hand.widow].filter(
        (c) => !keep.includes(c),
      );
      const money =
        at('money declarer', x) +
        at('money partner', x) +
        at('money left (leads)', x) +
        at('money right', x);
      const discardMoney = discarded.reduce(
        (m, c) => m + (c < 52 ? (MONEY_K[c % 13] as number) : 0),
        0,
      );
      expect(money).toBe(400 - discardMoney);
      const t = SUITS.indexOf(trump);
      const trumps =
        at('trumps declarer', x) +
        at('trumps partner', x) +
        at('trumps left', x) +
        at('trumps right', x);
      expect(trumps).toBe(13 - discarded.filter((c) => c < 52 && Math.floor(c / 13) === t).length);
      // Every special is in some hand: ours or theirs.
      expect(at('bull ours', x) + at('bull theirs', x)).toBe(1);
      expect(at('bear ours', x) + at('bear theirs', x)).toBe(1);
      expect(at('estimate', x)).toBeGreaterThanOrEqual(0);
    }
  });
});
