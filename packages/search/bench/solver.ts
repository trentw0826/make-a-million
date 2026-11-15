// Open-hand solver benchmark: solve time by tricks remaining.
// Usage: pnpm --dir packages/search exec tsx bench/solver.ts [positionsPerDepth] [mode]
import { playStateFromGame } from '../src/play/convert';
import { SearchAborted, Solver } from '../src/play/solver';
import { randomPlayStates } from '../test/helpers';

const perDepth = Number(process.argv[2] ?? 30);
const mode = (process.argv[3] ?? 'linear') as 'linear' | 'utility';
const limit = 20_000_000;
const utility = (c0: number, c1: number) => (c0 >= 180 ? 1 : 0) + (c0 - c1) / 1000;

const byTricks = new Map<number, ReturnType<typeof randomPlayStates>>();
for (
  let g = 0;
  byTricks.size < 13 || [...byTricks.values()].some((v) => v.length < perDepth);
  g++
) {
  if (g > 5000) break;
  for (const st of randomPlayStates(`bench-${g}`)) {
    const s = playStateFromGame(st);
    if (s.trickCount !== 0) continue;
    const left = s.cardsInHands / 4;
    const list = byTricks.get(left) ?? [];
    if (list.length < perDepth) list.push(st);
    byTricks.set(left, list);
  }
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? Number.NaN;
};

console.log(`mode=${mode}  tricks-left  median-ms  p90-ms  max-ms  median-nodes  aborted`);
for (let left = 2; left <= 13; left++) {
  const list = byTricks.get(left) ?? [];
  const ms: number[] = [];
  const nodes: number[] = [];
  let aborted = 0;
  for (const st of list) {
    const solver = new Solver(mode === 'linear' ? { mode } : { mode, utility });
    solver.nodeLimit = limit;
    const t0 = performance.now();
    try {
      if (process.env.MTD) solver.solveMtd(playStateFromGame(st));
      else solver.solve(playStateFromGame(st));
    } catch (e) {
      if (!(e instanceof SearchAborted)) throw e;
      aborted += 1;
    }
    ms.push(performance.now() - t0);
    nodes.push(solver.nodes);
  }
  console.log(
    `  ${String(left).padStart(2)}  ${pct(ms, 0.5).toFixed(2).padStart(9)}  ${pct(ms, 0.9).toFixed(2).padStart(7)}  ${Math.max(
      ...ms,
    )
      .toFixed(1)
      .padStart(7)}  ${String(pct(nodes, 0.5)).padStart(12)}  ${aborted}/${list.length}`,
  );
}
