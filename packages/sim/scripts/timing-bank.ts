// A decision bank for sizing budgets: collect observations from self-play once, then time
// any spec on exactly those positions, kind by kind. Unlike timing.ts (one discard and one
// trump per hand) it gives the slow contract decisions enough samples for a real p99.
// Usage:
//   tsx scripts/timing-bank.ts collect <bank.jsonl> [hands=200] [spec=hard]   (env SEED, WORKERS)
//   tsx scripts/timing-bank.ts time <bank.jsonl> <spec> [kinds=all]           (env WORKERS=4,
//       LIVE=lo-hi to keep plays with that many live cards, EVERY=n to keep every nth entry,
//       DEADLINE_MS to pass a deadline that far from each decision's start, OUT=results.jsonl,
//       REGRET=1 to score card plays against the true deal: exact with REGRET_EXACT (7) or fewer
//       tricks left, else REGRET_DEPTH (3) tricks deep; needs a bank collected with true hands)
// Time on an otherwise idle machine, with WORKERS matching the server's pool (4).
import { readFileSync, writeFileSync } from 'node:fs';
import type { BankEntry, DecideOutput } from '../src/bank';
import { handStarts, makeBoards } from '../src/duplicate';
import { defaultWorkers, runParallel } from '../src/parallel';
import '../src/registry';
import { RunningStats } from '../src/stats';

const [mode, file, ...rest] = process.argv.slice(2);
if (!file || (mode !== 'collect' && mode !== 'time')) {
  throw new Error('usage: timing-bank.ts collect|time <bank.jsonl> ...');
}

if (mode === 'collect') {
  const [handsArg = '200', spec = 'hard'] = rest;
  const seed = process.env.SEED ?? 'timing-bank';
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
  const boards = makeBoards(Number(handsArg), seed, handStarts(pool));
  const results = await runParallel(
    'bank',
    boards.map((b) => ({
      seed: b.seed,
      dealer: b.dealer,
      scores: b.scores,
      hands: 1,
      specs: [spec, spec, spec, spec] as const,
    })),
    { workers },
  );
  const entries = results.flat();
  writeFileSync(file, `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`);
  const kinds = new Map<string, number>();
  for (const e of entries) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
  console.log(`${entries.length} decisions → ${file}`, Object.fromEntries(kinds));
} else {
  const [spec, kindsArg = 'all'] = rest;
  if (!spec) throw new Error('time needs a spec');
  const workers = Number(process.env.WORKERS ?? 4);
  const every = Number(process.env.EVERY ?? 1);
  const [lo, hi] = (process.env.LIVE ?? '0-99').split('-').map(Number) as [number, number];
  const kinds = kindsArg === 'all' ? null : new Set(kindsArg.split(','));
  const bank: BankEntry[] = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as BankEntry)
    .filter((e) => !kinds || kinds.has(e.kind))
    .filter((e) => e.kind !== 'play' || (e.live >= lo && e.live <= hi))
    .filter((_, i) => i % every === 0);
  const deadlineMs = process.env.DEADLINE_MS ? Number(process.env.DEADLINE_MS) : undefined;
  const regret =
    process.env.REGRET === '1'
      ? {
          exactTricks: Number(process.env.REGRET_EXACT ?? 7),
          depth: Number(process.env.REGRET_DEPTH ?? 3),
        }
      : undefined;
  const t0 = performance.now();
  const results: DecideOutput[] = await runParallel(
    'decide',
    bank.map((entry) => ({
      spec,
      entry,
      ...(deadlineMs !== undefined ? { deadlineMs } : {}),
      ...(regret ? { regret } : {}),
    })),
    { workers },
  );
  console.log(
    `${spec}: ${results.length} decisions, ${((performance.now() - t0) / 1000).toFixed(0)}s, ${workers} workers`,
  );
  const pct = (sorted: readonly number[], p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] as number;
  const row = (label: string, idx: readonly number[]) => {
    if (idx.length === 0) return;
    const ms = idx.map((i) => (results[i] as DecideOutput).ms).sort((a, b) => a - b);
    const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
    const f = (x: number) => x.toFixed(0).padStart(6);
    const rs = new RunningStats();
    for (const i of idx) {
      const r = (results[i] as DecideOutput).regretK;
      if (r !== undefined) rs.push(r);
    }
    const reg = rs.n > 0 ? `  regret ${rs.mean.toFixed(2)} ±${(1.96 * rs.stderr).toFixed(2)}k` : '';
    console.log(
      `  ${label.padEnd(22)} ${String(ms.length).padStart(5)} ${f(mean)} ${f(pct(ms, 0.5))} ${f(pct(ms, 0.9))} ${f(pct(ms, 0.99))} ${f(ms[ms.length - 1] as number)}${reg}`,
    );
  };
  const all = bank.map((_, i) => i);
  console.log(`  ${'decision'.padEnd(22)}     n   mean    p50    p90    p99    max  (ms)`);
  row('all', all);
  for (const kind of ['misdeal', 'bid', 'discard', 'trump', 'play']) {
    row(
      kind,
      all.filter((i) => (bank[i] as BankEntry).kind === kind),
    );
  }
  for (let top = 52; top > 0; top -= 8) {
    const bottom = Math.max(1, top - 7);
    row(
      `  play, ${bottom}–${top} live`,
      all.filter((i) => {
        const e = bank[i] as BankEntry;
        return e.kind === 'play' && e.live >= bottom && e.live <= top;
      }),
    );
  }
  const slowest = [...all]
    .sort((a, b) => (results[b] as DecideOutput).ms - (results[a] as DecideOutput).ms)
    .slice(0, 8);
  console.log(
    '  slowest:',
    slowest
      .map((i) => {
        const e = bank[i] as BankEntry;
        return `${e.kind}@${e.live} ${(results[i] as DecideOutput).ms.toFixed(0)}ms (${e.seed})`;
      })
      .join('; '),
  );
  if (process.env.OUT) {
    writeFileSync(
      process.env.OUT,
      `${bank
        .map((e, i) =>
          JSON.stringify({
            seed: e.seed,
            kind: e.kind,
            live: e.live,
            ms: (results[i] as DecideOutput).ms,
            action: (results[i] as DecideOutput).action,
            regretK: (results[i] as DecideOutput).regretK,
          }),
        )
        .join('\n')}\n`,
    );
  }
}
