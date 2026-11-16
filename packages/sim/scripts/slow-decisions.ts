// Finds slow bot decisions. Usage: tsx scripts/slow-decisions.ts <spec> [boards] [thresholdMs]
import { cardById, cardLabel } from '@mam/engine';
import '../src/registry';
import { playGame } from '../src/runner';
import { makeStrategy } from '../src/strategies';

const spec = process.argv[2] ?? 'hard';
const boards = Number(process.argv[3] ?? 10);
const threshold = Number(process.argv[4] ?? 1500);

for (let i = 0; i < boards; i++) {
  const bot = makeStrategy(spec);
  const normal = makeStrategy('normal');
  await playGame({
    seed: `slow:${i}`,
    hands: 1,
    strategies: [bot, normal, bot, normal],
    onDecision: ({ seat, obs, action, ms }) => {
      if (ms < threshold) return;
      const left = obs.handSizes.reduce((a, b) => a + b, 0);
      console.log(
        `board ${i} seat ${seat} ${obs.phase} ${ms.toFixed(0)}ms: cards left ${left}, trick ${obs.currentTrick?.plays.length ?? 0}, legal ${obs.legal.kind === 'play' ? obs.legal.cardIds.length : '-'}, chose ${action.type === 'playCard' ? cardLabel(cardById(action.cardId)) : action.type}`,
      );
    },
  });
}
