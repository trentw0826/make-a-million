// Is the bidding's estimate of "bid minus pass" right? At one random optional bid decision
// per hand, the hand is played out both ways with common randomness; compares the realised
// difference with the bot's estimate.
// Usage: tsx scripts/bid-rollouts.ts [spec=hard] [hands=1500] [out.jsonl]  (env WORKERS, SEED)
import { writeFileSync } from 'node:fs';
import type { BidRolloutLine } from '../src/bidRollout';
import { handStarts, makeBoards } from '../src/duplicate';
import { defaultWorkers, runParallel } from '../src/parallel';
import { RunningStats } from '../src/stats';
import '../src/registry';

const [spec = 'hard', handsArg = '1500', out] = process.argv.slice(2);
const count = Number(handsArg);
const seed = process.env.SEED ?? 'bid-rollouts';
const workers = Number(process.env.WORKERS ?? defaultWorkers());

const pool = await runParallel(
  'play',
  Array.from({ length: 200 }, (_, i) => ({
    seed: `${seed}:pool:${i}`,
    dealer: (i % 4) as 0 | 1 | 2 | 3,
    specs: ['normal', 'normal', 'normal', 'normal'] as const,
  })),
  { workers },
);
const boards = makeBoards(count, seed, handStarts(pool));
const t0 = performance.now();
const results = await runParallel(
  'bidRollout',
  boards.map((b) => ({
    seed: b.seed,
    dealer: b.dealer,
    scores: b.scores,
    specs: [spec, spec, spec, spec] as const,
  })),
  { workers },
);
const lines = results.filter((r): r is BidRolloutLine => r !== null);
if (out) writeFileSync(out, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
console.log(
  `${spec}: ${lines.length} decisions played out both ways, from ${count} hands, in ${((performance.now() - t0) / 1000).toFixed(0)}s`,
);

const stat = (xs: readonly number[]) => {
  const r = new RunningStats();
  for (const x of xs) r.push(x);
  return r;
};
const fmt = (xs: readonly number[]) => {
  const r = stat(xs);
  return `${(100 * r.mean).toFixed(2)}% [${(100 * r.ci95[0]).toFixed(2)}, ${(100 * r.ci95[1]).toFixed(2)}]`;
};
console.log(`  realised equity of bidding over passing: ${fmt(lines.map((l) => l.dEquity))}`);
for (const chose of ['bid', 'pass'] as const) {
  const sel = lines.filter((l) => l.chose === chose);
  if (sel.length > 0) {
    console.log(
      `  when the bot chose to ${chose} (${sel.length}): ${fmt(sel.map((l) => l.dEquity))}`,
    );
  }
}
// Does the estimated advantage predict the realised one?
const est = lines.map((l) => l.declare - l.pass);
const act = lines.map((l) => l.dEquity);
const n = lines.length;
const mx = est.reduce((a, b) => a + b, 0) / n;
const my = act.reduce((a, b) => a + b, 0) / n;
let sxx = 0;
let sxy = 0;
let syy = 0;
for (let i = 0; i < n; i++) {
  sxx += ((est[i] as number) - mx) ** 2;
  sxy += ((est[i] as number) - mx) * ((act[i] as number) - my);
  syy += ((act[i] as number) - my) ** 2;
}
console.log(
  `  realised = ${my.toFixed(4)} + ${(sxy / sxx).toFixed(2)} × (estimate − ${mx.toFixed(4)}), r = ${(sxy / Math.sqrt(sxx * syy)).toFixed(3)}`,
);
const order = [...lines].sort((a, b) => a.declare - a.pass - (b.declare - b.pass));
const q = 5;
for (let k = 0; k < q; k++) {
  const part = order.slice(Math.floor((k * n) / q), Math.floor(((k + 1) * n) / q));
  const e = stat(part.map((l) => l.declare - l.pass)).mean;
  console.log(
    `    estimate quintile ${k + 1}: mean estimate ${(100 * e).toFixed(2)}%, realised ${fmt(part.map((l) => l.dEquity))}, bot bid ${((100 * part.filter((l) => l.chose === 'bid').length) / part.length).toFixed(0)}%`,
  );
}
