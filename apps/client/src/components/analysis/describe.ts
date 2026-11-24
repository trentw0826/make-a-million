import { type Action, cardById, cardLabel } from '@mam/engine';
import type { AnalysisDecision, MoveLabel } from '@mam/protocol';
import { SUIT_NAMES, shortMoney } from '../../format';

export type AnalysisOption = AnalysisDecision['options'][number];

export const LABEL_TEXT: Readonly<Record<MoveLabel, string>> = {
  best: 'Best',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
  forced: 'Forced',
};

/** Whether an option is the analysis of `action`. Any bid counts as bidding the minimum. */
export function matches(option: AnalysisOption, action: Action): boolean {
  const a = option.action;
  switch (a.type) {
    case 'playCard':
      return action.type === 'playCard' && action.cardId === a.cardId;
    case 'nameTrump':
      return action.type === 'nameTrump' && action.suit === a.suit;
    case 'discard':
      return (
        action.type === 'discard' &&
        [...action.cardIds].sort((x, y) => x - y).join() ===
          [...a.cardIds].sort((x, y) => x - y).join()
      );
    default:
      return action.type === a.type;
  }
}

export function optionFor(decision: AnalysisDecision, action: Action): AnalysisOption | null {
  return decision.options.find((o) => matches(o, action)) ?? null;
}

/** "Best", or what an option gives up against the best, such as "−$12k". */
export function valueText(decision: AnalysisDecision, option: AnalysisOption): string {
  const best = decision.options[decision.best];
  if (!best || option === best) return 'Best';
  const lossK = Math.max(0, best.points - option.points);
  // Under a thousand is within the analysis's own noise: as good as the best.
  return lossK < 1 ? 'Best' : shortMoney(-lossK * 1000);
}

/** "Red 7", "Green $40k", "the Tiger". */
export function cardName(id: number): string {
  const card = cardById(id);
  return card.kind === 'suit'
    ? `${SUIT_NAMES[card.suit]} ${cardLabel(card)}`
    : `the ${cardLabel(card)}`;
}

/** An action in words, for "best was …". */
export function describeAction(action: Action): string {
  switch (action.type) {
    case 'playCard':
      return cardName(action.cardId);
    case 'bid':
      return `bidding ${shortMoney(action.amount)}`;
    case 'pass':
      return 'passing';
    case 'callMisdeal':
      return 'calling a misdeal';
    case 'nameTrump':
      return `${SUIT_NAMES[action.suit]} trump`;
    case 'discard':
      return `discarding ${action.cardIds.map(cardName).join(', ')}`;
    case 'continue':
      return 'going on';
  }
}
