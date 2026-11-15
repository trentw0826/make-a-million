// Cost of exact endgame solves in linear mode vs utility (threshold / match-equity) mode.
// Usage: pnpm --dir packages/search exec tsx bench/utility.ts [positions] [tricksLeft]
import { DEFAULT_RULESET } from '@mam/engine';
import { captureUtility } from '../src/equity';
import { ME_TABLE } from '../src/generated/meTable';
import { playStateFromGame } from '../src/play/convert';
import { Solver } from '../src/play/solver';
import { randomPlayStates } from '../test/helpers';

const count = Number(process.argv[2] ?? 40);
const left = Number(process.argv[3] ?? 6);
const CAP = 400_000;

const positions = [];
for (let g = 0; positions.length < count && g < 5000; g++) {
  for (const st of randomPlayStates(`util-${left}-${g}`)) {
    const s = playStateFromGame(st);
    if (s.trickCount === 0 && s.cardsInHands === left * 4) {
      positions.push(st);
      break;
    }
  }
}

function run(label: string, make: () => Solver): void {
  const nodes: number[] = [];
  let ms = 0;
  for (const st of positions) {
    const solver = make();
    const t0 = performance.now();
    solver.rootValues(playStateFromGame(st));
    ms += performance.now() - t0;
    nodes.push(solver.nodes);
  }
  nodes.sort((a, b) => a - b);
  const over = nodes.filter((n) => n > CAP).length;
  const med = nodes[Math.floor(nodes.length / 2)] as number;
  const p90 = nodes[Math.floor(nodes.length * 0.9)] as number;
  console.log(
    `${label.padEnd(8)} mean ${(ms / positions.length).toFixed(1)}ms  median ${med} nodes  p90 ${p90}  >${CAP}: ${over}/${positions.length}`,
  );
}

console.log(`${positions.length} positions, ${left} tricks left, exact solve of every root move`);
run('linear', () => new Solver({ mode: 'linear' }));
for (const mode of ['margin', 'equity'] as const) {
  const u = captureUtility(
    {
      ruleset: DEFAULT_RULESET,
      scores: [420_000, 360_000],
      dealer: 3,
      bidder: 0,
      bid: 185_000,
    },
    0,
    mode,
    ME_TABLE,
  );
  run(mode, () => new Solver({ mode: 'utility', utility: (a, b) => u([a * 1000, b * 1000]) }));
}
