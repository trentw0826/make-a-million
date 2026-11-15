// Calibration report for the contract estimator: does the playout estimate used by bidding
// predict what the bidder really captures when the hand is played out?
// Usage: tsx scripts/calibrate.ts [spec=hard] [hands=400] [out.jsonl]  (env WORKERS, SEED)
import { writeFileSync } from 'node:fs';
import { handStarts, makeBoards } from '../src/duplicate';
import { defaultWorkers, runParallel } from '../src/parallel';
import { RunningStats } from '../src/stats';
import type { CalibrationLine } from '../src/tasks';
import '../src/registry';

const [spec = 'hard', handsArg = '400', out] = process.argv.slice(2);
const count = Number(handsArg);
const seed = process.env.SEED ?? 'calibrate';
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
  'calibrate',
  boards.map((b) => ({
    seed: b.seed,
    dealer: b.dealer,
    scores: b.scores,
    specs: [spec, spec, spec, spec] as const,
  })),
  { workers },
);
const lines = results.filter((r): r is CalibrationLine => r !== null);
if (out) writeFileSync(out, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);

function stats(xs: readonly number[]): RunningStats {
  const r = new RunningStats();
  for (const x of xs) r.push(x);
  return r;
}
const mean = (xs: readonly number[]) => stats(xs).mean;

const k = (x: number) => `${(x / 1000).toFixed(1)}k`;
const ci = (xs: number[]) => {
  const r = stats(xs);
  return `${k(r.mean)} [${k(r.ci95[0])}, ${k(r.ci95[1])}]`;
};
console.log(
  `${spec}: ${lines.length} contracts from ${count} hands in ${((performance.now() - t0) / 1000).toFixed(0)}s`,
);
console.log(
  `  made ${((100 * lines.filter((l) => l.made).length) / lines.length).toFixed(1)}%, mean bid ${k(mean(lines.map((l) => l.bid)))}, mean capture ${k(mean(lines.map((l) => l.actual)))}`,
);
console.log(
  `  estimate − actual (heuristic contract): ${ci(lines.map((l) => l.estimate - l.actual))}`,
);
console.log(
  `  estimate − actual (contract as chosen):  ${ci(lines.map((l) => l.estimateChosen - l.actual))}`,
);

const table = (title: string, key: (l: CalibrationLine) => number, edges: number[]) => {
  console.log(`\n  ${title}`);
  console.log('    band           n   made%   bid    est.   actual  est−actual');
  for (let i = 0; i <= edges.length; i++) {
    const lo = i === 0 ? Number.NEGATIVE_INFINITY : (edges[i - 1] as number);
    const hi = i === edges.length ? Number.POSITIVE_INFINITY : (edges[i] as number);
    const band = lines.filter((l) => key(l) >= lo && key(l) < hi);
    if (band.length === 0) continue;
    const label = `${Number.isFinite(lo) ? k(lo) : '−∞'}..${Number.isFinite(hi) ? k(hi) : '∞'}`;
    const made = (100 * band.filter((l) => l.made).length) / band.length;
    console.log(
      `    ${label.padEnd(13)} ${String(band.length).padStart(3)}  ${made.toFixed(0).padStart(5)}  ${k(mean(band.map((l) => l.bid))).padStart(6)} ${k(mean(band.map((l) => l.estimate))).padStart(6)} ${k(mean(band.map((l) => l.actual))).padStart(7)}  ${k(mean(band.map((l) => l.estimate - l.actual))).padStart(7)}`,
    );
  }
};
table('by bid', (l) => l.bid, [180_000, 190_000, 200_000, 215_000, 230_000]);
table(
  'by estimated margin over the bid',
  (l) => l.estimate - l.bid,
  [-40_000, -20_000, 0, 20_000, 40_000],
);

// Auctions: who drove the price up?
const sameTeam = (a: number, b: number) => a % 2 === b % 2;
const bidsOf = (l: CalibrationLine) =>
  l.auction.filter((e): e is Extract<typeof e, { kind: 'bid' }> => e.kind === 'bid');
const contested = (l: CalibrationLine) => bidsOf(l).some((e) => !sameTeam(e.seat, l.bidder));
/** The winning team bid over its own partner's standing bid. */
const overPartner = (l: CalibrationLine) => {
  const bids = bidsOf(l);
  return bids.some(
    (e, i) =>
      i > 0 &&
      e.seat !== bids[i - 1]?.seat &&
      sameTeam(e.seat, (bids[i - 1] as { seat: number }).seat),
  );
};
const group = (title: string, pred: (l: CalibrationLine) => boolean) => {
  const g = lines.filter(pred);
  if (g.length === 0) return;
  const made = (100 * g.filter((l) => l.made).length) / g.length;
  console.log(
    `    ${title.padEnd(34)} ${String(g.length).padStart(3)}  made ${made.toFixed(0).padStart(3)}%  bid ${k(mean(g.map((l) => l.bid)))}  est ${k(mean(g.map((l) => l.estimate)))}  actual ${k(mean(g.map((l) => l.actual)))}`,
  );
};
console.log('\n  by auction');
group('uncontested (one team bid)', (l) => !contested(l));
group('contested (both teams bid)', contested);
group('a partner raised over partner', overPartner);
group('contested, no partner raise', (l) => contested(l) && !overPartner(l));
