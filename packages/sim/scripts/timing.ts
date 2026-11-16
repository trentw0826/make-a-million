// Decision-time profile of a bot: percentiles by decision kind and, for card play, by how
// many cards are left. Compare p99 with the server's fixed reply delay for that level.
// Usage: tsx scripts/timing.ts [spec=hard] [hands=100]  (env WORKERS, SEED)
// Timings are wall-clock inside each worker, so run on an otherwise idle machine, with
// WORKERS no more than the free cores, for numbers that match one server worker thread.
import { handStarts, makeBoards } from '../src/duplicate';
import { defaultWorkers, runParallel } from '../src/parallel';
import type { TimedDecision } from '../src/tasks';
import '../src/registry';

const [spec = 'hard', handsArg = '100'] = process.argv.slice(2);
const count = Number(handsArg);
const seed = process.env.SEED ?? 'timing';
const workers = Number(process.env.WORKERS ?? defaultWorkers());

const pool = await runParallel(
  'play',
  Array.from({ length: 100 }, (_, i) => ({
    seed: `${seed}:pool:${i}`,
    dealer: (i % 4) as 0 | 1 | 2 | 3,
    specs: ['normal', 'normal', 'normal', 'normal'] as const,
  })),
  { workers },
);
const boards = makeBoards(count, seed, handStarts(pool));
const t0 = performance.now();
const results = await runParallel(
  'timing',
  boards.map((b) => ({
    seed: b.seed,
    dealer: b.dealer,
    scores: b.scores,
    hands: 1,
    specs: [spec, spec, spec, spec] as const,
  })),
  { workers },
);
const all: TimedDecision[] = results.flat();
console.log(
  `${spec}: ${all.length} decisions in ${count} hands, ${((performance.now() - t0) / 1000).toFixed(0)}s, ${workers} workers`,
);

function pct(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] as number;
}
function row(label: string, ds: readonly TimedDecision[]): void {
  const ms = ds.map((d) => d[4]).sort((a, b) => a - b);
  const mean = ms.reduce((a, b) => a + b, 0) / (ms.length || 1);
  const f = (x: number) => x.toFixed(0).padStart(6);
  console.log(
    `  ${label.padEnd(22)} ${String(ms.length).padStart(5)} ${f(mean)} ${f(pct(ms, 0.5))} ${f(pct(ms, 0.9))} ${f(pct(ms, 0.99))} ${f(ms[ms.length - 1] ?? Number.NaN)}`,
  );
}
console.log(`  ${'decision'.padEnd(22)}     n   mean    p50    p90    p99    max  (ms)`);
row('all', all);
for (const kind of ['misdeal', 'bid', 'discard', 'trump', 'play']) {
  const ds = all.filter((d) => d[1] === kind);
  if (ds.length > 0) row(kind, ds);
}
const plays = all.filter((d) => d[1] === 'play' && d[3] > 1);
row('play, >1 legal', plays);
for (let hi = 52; hi > 0; hi -= 8) {
  const lo = Math.max(1, hi - 7);
  const ds = plays.filter((d) => d[2] >= lo && d[2] <= hi);
  if (ds.length > 0) row(`  play, ${lo}–${hi} cards left`, ds);
}
