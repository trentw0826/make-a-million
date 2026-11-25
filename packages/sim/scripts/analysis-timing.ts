// Compute-time profile of the solo analysis, by position kind, under several sets of options,
// and how far their answers agree. Compare p99 with the server's analysis deadline.
// Usage: tsx scripts/analysis-timing.ts [hands=40] [variant...]
//   variant: label=base[:key=value,...], base hard or expert, keys from AnalysisOptions or
//   HardOptions (default: "hard=hard expert=expert").
// Env: WORKERS, SEED, BOTS (the bots playing the hands, default hard), DEADLINE (ms), BOT
//   (hard or expert: also time that bot making the same decisions, as the last column).
// Timings are wall-clock inside each worker: run on an otherwise idle machine, with WORKERS
// no more than the free cores, for numbers that match one server worker thread.
import type { AnalysisTimingLine, AnalysisVariant } from '../src/analysisTiming';
import { handStarts, makeBoards } from '../src/duplicate';
import { defaultWorkers, runParallel } from '../src/parallel';
import type { BotSpec } from '../src/strategies';
import '../src/registry';

const [handsArg = '40', ...variantArgs] = process.argv.slice(2);
const count = Number(handsArg);
const seed = process.env.SEED ?? 'analysis-timing';
const workers = Number(process.env.WORKERS ?? defaultWorkers());
const bots = (process.env.BOTS ?? 'hard') as BotSpec;
const deadlineMs = process.env.DEADLINE ? Number(process.env.DEADLINE) : undefined;
const bot = process.env.BOT as 'hard' | 'expert' | undefined;

function parseVariant(arg: string): AnalysisVariant {
  const [label, rest] = arg.split('=', 2) as [string, string | undefined];
  const [base, opts] = (rest ?? label).split(':', 2) as [string, string | undefined];
  if (base !== 'hard' && base !== 'expert') throw new Error(`unknown base "${base}"`);
  const options: Record<string, string> = {};
  for (const kv of opts?.split(',') ?? []) {
    const [k, v] = kv.split('=') as [string, string];
    options[k] = v;
  }
  return { label, base, options };
}
const variants = (variantArgs.length > 0 ? variantArgs : ['hard=hard', 'expert=expert']).map(
  parseVariant,
);

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
  'analysisTiming',
  boards.map((b) => ({
    seed: b.seed,
    dealer: b.dealer,
    scores: b.scores,
    hands: 1,
    specs: [bots, bots, bots, bots] as const,
    variants,
    ...(deadlineMs !== undefined ? { deadlineMs } : {}),
    ...(bot ? { bot } : {}),
  })),
  { workers },
);
const all: AnalysisTimingLine[] = results.flat();
console.log(
  `${all.length} positions in ${count} hands (${bots} bots), ${((performance.now() - t0) / 1000).toFixed(0)}s, ${workers} workers${deadlineMs ? `, deadline ${deadlineMs} ms` : ''}`,
);

function pct(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] as number;
}
const f = (x: number) => x.toFixed(0).padStart(6);
const columns = [...variants.map((v) => v.label), ...(bot ? [`bot-${bot}`] : [])];
function row(label: string, lines: readonly AnalysisTimingLine[]): void {
  const cells = columns.map((_, v) => {
    const ms = lines.map((l) => (l.results[v] as { ms: number }).ms).sort((a, b) => a - b);
    const mean = ms.reduce((a, b) => a + b, 0) / (ms.length || 1);
    return `${f(mean)} ${f(pct(ms, 0.5))} ${f(pct(ms, 0.99))} ${f(ms[ms.length - 1] ?? Number.NaN)}`;
  });
  console.log(`  ${label.padEnd(20)} ${String(lines.length).padStart(5)}  ${cells.join('  |')}`);
}
console.log(
  `  ${'position'.padEnd(20)}     n  ${columns.map((c) => `${c.slice(0, 6).padStart(6)}    p50    p99    max`).join('  |')}  (ms; first column is the mean)`,
);
row('all', all);
const kinds = [...new Set(all.map((l) => l.kind))].sort();
for (const kind of kinds)
  row(
    kind,
    all.filter((l) => l.kind === kind),
  );
const plays = all.filter(
  (l) => l.kind === 'play' && Object.keys(l.results[0]?.points ?? {}).length > 1,
);
for (let hi = 52; hi > 0; hi -= 12) {
  const lo = Math.max(1, hi - 11);
  const ls = plays.filter((l) => l.live >= lo && l.live <= hi);
  if (ls.length > 0) row(`  play ${lo}–${hi} left`, ls);
}

// Agreement with the first variant: the same best choice, and what each one's best gives up
// by the other's values ($1000s), on decisions with more than one option.
const choices = all.filter((l) => Object.keys(l.results[0]?.points ?? {}).length > 1);
for (let v = 1; v < variants.length; v++) {
  let same = 0;
  let lossFirstByV = 0;
  let lossVByFirst = 0;
  let dWin = 0;
  for (const l of choices) {
    const a = l.results[0] as AnalysisTimingLine['results'][number];
    const b = l.results[v] as AnalysisTimingLine['results'][number];
    if (a.best === b.best) same += 1;
    const bBest = b.best ? (b.points[b.best] ?? 0) : 0;
    const aBest = a.best ? (a.points[a.best] ?? 0) : 0;
    lossFirstByV += a.best && a.best in b.points ? bBest - (b.points[a.best] ?? 0) : 0;
    lossVByFirst += b.best && b.best in a.points ? aBest - (a.points[b.best] ?? 0) : 0;
  }
  for (const l of all) {
    dWin += Math.abs((l.results[v]?.winChance ?? 0) - (l.results[0]?.winChance ?? 0));
  }
  const n = Math.max(1, choices.length);
  console.log(
    `${variants[v]?.label} vs ${variants[0]?.label}: same best choice ${((100 * same) / n).toFixed(1)}% of ${choices.length} decisions; ` +
      `${variants[0]?.label}'s best gives up ${(lossFirstByV / n).toFixed(2)}k by ${variants[v]?.label}'s values, ` +
      `${variants[v]?.label}'s best ${(lossVByFirst / n).toFixed(2)}k by ${variants[0]?.label}'s; ` +
      `mean |Δ win chance| ${((100 * dWin) / Math.max(1, all.length)).toFixed(2)} points`,
  );
}
