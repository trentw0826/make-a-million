import { type Action, cardById, isMoney, isNumberCard, type Observation } from '@mam/engine';

/**
 * The simplest legal action for the seat, or null when it has nothing to do. The server
 * uses this when a strategy misbehaves, so a game can never stall on a bot.
 */
export function fallbackAction(obs: Pick<Observation, 'legal' | 'hand'>): Action | null {
  const legal = obs.legal;
  switch (legal.kind) {
    case 'none':
      return null;
    case 'misdeal':
      return { type: 'declineMisdeal' };
    case 'bid':
      return legal.canPass ? { type: 'pass' } : { type: 'bid', amount: legal.minBid };
    case 'discard': {
      const numbers = obs.hand.filter((id) => isNumberCard(cardById(id)));
      const money = obs.hand.filter((id) => isMoney(cardById(id)));
      const chosen = numbers.slice(0, legal.requiredNumberCards);
      for (const id of money) {
        if (chosen.length === 3) break;
        chosen.push(id);
      }
      return { type: 'discard', cardIds: chosen };
    }
    case 'trump':
      return { type: 'nameTrump', suit: legal.suits[0] ?? 'red' };
    case 'play': {
      const first = legal.cardIds[0];
      if (first === undefined) return null;
      return { type: 'playCard', cardId: first };
    }
    case 'continue':
      return { type: 'continue' };
  }
}
