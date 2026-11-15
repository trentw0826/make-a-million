// Depth-limited vs exact: time and regret of the chosen move.
// Usage: pnpm --dir packages/search exec tsx bench/depth.ts [positions]
import { playStateFromGame } from '../src/play/convert';
import { Solver } from '../src/play/solver';
import { randomPlayStates } from '../test/helpers';

const count = Number(process.argv[2] ?? 30);

function positionsWith(left: number) {
  const out = [];
  for (let g = 0; out.length < count && g < 5000; g++) {
    for (const st of randomPlayStates(`depth-${left}-${g}`)) {
      const s = playStateFromGame(st);
      if (s.trickCount === 0 && s.cardsInHands === left * 4) {
        out.push(st);
        break;
      }
    }
  }
  return out;
}

function chooseIndex(values: readonly number[], team0: boolean): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    const v = values[i] as number;
    if (team0 ? v > (values[best] as number) : v < (values[best] as number)) best = i;
  }
  return best;
}

const sevens = positionsWith(7);
console.log(`7 tricks left, ${sevens.length} positions: depth, mean ms, mean regret ($k), % best`);
const exact = sevens.map((st) => {
  const solver = new Solver({ mode: 'linear' });
  const t0 = performance.now();
  const r = solver.rootValues(playStateFromGame(st));
  return { r, ms: performance.now() - t0 };
});
console.log(`  exact  ${(exact.reduce((a, e) => a + e.ms, 0) / exact.length).toFixed(1)}ms`);
for (const depth of [1, 2, 3, 4]) {
  let ms = 0;
  let regret = 0;
  let best = 0;
  sevens.forEach((st, k) => {
    const solver = new Solver({ mode: 'linear' });
    solver.depthTricks = depth;
    const s = playStateFromGame(st);
    const team0 = (s.turn & 1) === 0;
    const t0 = performance.now();
    const r = solver.rootValues(s);
    ms += performance.now() - t0;
    const ex = (exact[k] as (typeof exact)[0]).r.values;
    const pick = chooseIndex(r.values, team0);
    const opt = ex[chooseIndex(ex, team0)] as number;
    const got = ex[pick] as number;
    regret += Math.abs(opt - got);
    if (opt === got) best += 1;
  });
  console.log(
    `  d=${depth}   ${(ms / sevens.length).toFixed(1)}ms  regret ${(regret / sevens.length).toFixed(2)}  ${((100 * best) / sevens.length).toFixed(0)}%`,
  );
}

const thirteens = positionsWith(13);
console.log(`\n13 tricks left: time per root-values call by depth`);
for (const depth of [1, 2, 3]) {
  let ms = 0;
  let max = 0;
  for (const st of thirteens) {
    const solver = new Solver({ mode: 'linear' });
    solver.depthTricks = depth;
    const t0 = performance.now();
    solver.rootValues(playStateFromGame(st));
    const t = performance.now() - t0;
    ms += t;
    max = Math.max(max, t);
  }
  console.log(
    `  d=${depth}  mean ${(ms / thirteens.length).toFixed(1)}ms  max ${max.toFixed(0)}ms`,
  );
}
