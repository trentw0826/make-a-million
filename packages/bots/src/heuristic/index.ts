import type { Action, Observation, Rng } from '@mam/engine';
import type { BotStrategy } from '../strategy';
import { analyze } from './analysis';
import { chooseBid } from './bidding';
import { chooseDiscards } from './discard';
import { bestTrump } from './evaluate';
import { choosePlay } from './play';

/**
 * The "normal" bot: hand evaluation for bidding and trump choice, void-making discards,
 * and trick play that cashes winners, feeds Money to a winning partner, trumps rich
 * tricks and uses the Bull and Bear when they pay.
 */
export class HeuristicBot implements BotStrategy {
  readonly id = 'normal';

  decide(obs: Observation, rng: Rng): Action {
    const legal = obs.legal;
    switch (legal.kind) {
      case 'none':
        throw new Error('HeuristicBot asked to act with no legal moves');
      case 'bid':
        // Any hand weak enough for a misdeal is worth re-dealing.
        if (legal.canCallMisdeal) return { type: 'callMisdeal' };
        return chooseBid(analyze(obs));
      case 'discard': {
        const a = analyze(obs);
        return { type: 'discard', cardIds: chooseDiscards(a.myCards, legal.requiredNumberCards) };
      }
      case 'trump':
        return { type: 'nameTrump', suit: bestTrump(analyze(obs).myCards).suit };
      case 'play':
        return { type: 'playCard', cardId: choosePlay(analyze(obs), legal.cardIds, rng) };
      case 'continue':
        return { type: 'continue' };
    }
  }
}
