// Paired comparison of two timing-bank results (OUT files of `timing-bank.ts time` on the same
// bank): how often the two specs choose alike, their time, and, for card plays scored with
// REGRET=1, the mean difference in true-deal regret with a 95% interval.
// Usage: tsx scripts/compare-bank.ts <a.jsonl> <b.jsonl>
import { readFileSync } from 'node:fs';
import { RunningStats } from '../src/stats';

interface Line {
  readonly seed: string;
  readonly kind: string;
  readonly live: number;
  readonly ms: number;
  readonly action: unknown;
  readonly regretK?: number;
}

const [fa, fb] = process.argv.slice(2);
if (!fa || !fb) throw new Error('usage: compare-bank.ts a.jsonl b.jsonl');
const read = (f: string) =>
  new Map(
    readFileSync(f, 'utf8')
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as Line)
      .map((l) => [l.seed, l] as const),
  );
const a = read(fa);
const b = read(fb);
const groups = new Map<string, { a: Line; b: Line }[]>();
for (const [seed, la] of a) {
  const lb = b.get(seed);
  if (!lb) continue;
  for (const g of ['all', la.kind]) {
    const list = groups.get(g) ?? [];
    list.push({ a: la, b: lb });
    groups.set(g, list);
  }
}
console.log(`A = ${fa}\nB = ${fb}`);
console.log(
  `  ${'kind'.padEnd(10)} ${'n'.padStart(6)} ${'same'.padStart(7)}  ${'A ms'.padStart(7)} ${'B ms'.padStart(7)}  regret A − B ($k, 95%)`,
);
for (const [g, pairs] of groups) {
  const same = pairs.filter((p) => JSON.stringify(p.a.action) === JSON.stringify(p.b.action));
  const msA = pairs.reduce((s, p) => s + p.a.ms, 0) / pairs.length;
  const msB = pairs.reduce((s, p) => s + p.b.ms, 0) / pairs.length;
  const d = new RunningStats();
  for (const p of pairs) {
    if (p.a.regretK !== undefined && p.b.regretK !== undefined) d.push(p.a.regretK - p.b.regretK);
  }
  const reg =
    d.n > 0
      ? `${d.mean.toFixed(3)} [${d.ci95[0].toFixed(3)}, ${d.ci95[1].toFixed(3)}] (n ${d.n})`
      : '—';
  console.log(
    `  ${g.padEnd(10)} ${String(pairs.length).padStart(6)} ${((100 * same.length) / pairs.length).toFixed(1).padStart(6)}%  ${msA.toFixed(0).padStart(7)} ${msB.toFixed(0).padStart(7)}  ${reg}`,
  );
}
