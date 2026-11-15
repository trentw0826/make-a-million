import {
  type Action,
  cardById,
  isMoney,
  isNumberCard,
  type Observation,
  type Rng,
} from '@mam/engine';
import type { BotStrategy } from './strategy';

/**
 * The "easy" bot: legal but thoughtless. It plays and discards at random, names a random
 * trump, calls a misdeal whenever it may, and never raises: it opens at the minimum
 * and otherwise passes, so two of them can never run an auction away.
 */
export class RandomBot implements BotStrategy {
  readonly id = 'easy';

  decide(obs: Observation, rng: Rng): Action {
    const legal = obs.legal;
    switch (legal.kind) {
      case 'none':
        throw new Error('RandomBot asked to act with no legal moves');
      case 'misdeal':
        return legal.canCall ? { type: 'callMisdeal' } : { type: 'declineMisdeal' };
      case 'bid':
        return legal.canPass && obs.auction.some((e) => e.kind === 'bid')
          ? { type: 'pass' }
          : { type: 'bid', amount: legal.minBid };
      case 'discard': {
        const numbers = rng.shuffle(obs.hand.filter((id) => isNumberCard(cardById(id))));
        const money = rng.shuffle(obs.hand.filter((id) => isMoney(cardById(id))));
        const chosen = numbers.slice(0, legal.requiredNumberCards);
        while (chosen.length < 3) chosen.push(money.shift() as number);
        return { type: 'discard', cardIds: chosen };
      }
      case 'trump':
        return { type: 'nameTrump', suit: rng.pick(legal.suits) };
      case 'play':
        return { type: 'playCard', cardId: rng.pick(legal.cardIds) };
      case 'continue':
        return { type: 'continue' };
    }
  }
}
