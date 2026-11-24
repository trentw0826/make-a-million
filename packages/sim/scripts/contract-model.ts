// Fits a linear contract-value model: the declaring team's capture from features of the deal
// (packages/bots/src/contract/value.ts), on contracts written by scripts/contract-data.ts.
// Holds out a fifth of the contracts (by seed) and compares, on them, the current calibration
// of the greedy playout (130k + 0.5 × estimate, SD 58k), a refit on the estimate alone, and the
// full model: correlation with the capture, RMSE, and the log loss of make-or-set at the bid.
// Usage: tsx scripts/contract-model.ts <data.jsonl> [more.jsonl ...]
//   (env LAMBDA=1 ridge penalty, TEST=held-out.jsonl to test on other data instead of the split,
//    WRITE=1 to write packages/bots/src/contract/generated/contractModel.ts from all the data,
//    NOTE to record where the data came from in its header)
import { readFileSync, writeFileSync } from 'node:fs';
import { CONTRACT_FEATURE_COUNT, CONTRACT_FEATURES, contractFeatures } from '@mam/bots';
import type { Seat } from '@mam/engine';
import type { ContractRecord } from '../src/contractData';

const files = process.argv.slice(2);
if (files.length === 0) throw new Error('usage: contract-model.ts data.jsonl ...');
const lambda = Number(process.env.LAMBDA ?? 1);

interface Row {
  readonly x: Float64Array;
  readonly y: number;
  readonly bid: number;
  readonly seed: string;
}

function load(paths: readonly string[]): Row[] {
  return paths.flatMap((f) =>
    readFileSync(f, 'utf8')
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as ContractRecord)
      .map((r) => ({
        x: contractFeatures({ hands: r.hands, widow: r.widow }, r.bidder as Seat),
        y: (r.captured[r.bidder % 2] as number) / 1000,
        bid: r.bid / 1000,
        seed: r.seed,
      })),
  );
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Ridge regression by the normal equations (the bias is not penalised). */
function fit(rows: readonly Row[], cols: readonly number[]): number[] {
  const k = cols.length;
  const a = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
  for (const r of rows) {
    for (let i = 0; i < k; i++) {
      const xi = r.x[cols[i] as number] as number;
      const ai = a[i] as number[];
      for (let j = 0; j < k; j++)
        ai[j] = (ai[j] as number) + xi * (r.x[cols[j] as number] as number);
      ai[k] = (ai[k] as number) + xi * r.y;
    }
  }
  for (let i = 0; i < k; i++)
    if (cols[i] !== 0) (a[i] as number[])[i] += (lambda * rows.length) / 1000;
  // Gaussian elimination with partial pivoting.
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) {
      if (Math.abs((a[r] as number[])[c] as number) > Math.abs((a[piv] as number[])[c] as number))
        piv = r;
    }
    [a[c], a[piv]] = [a[piv] as number[], a[c] as number[]];
    const pc = a[c] as number[];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const pr = a[r] as number[];
      const f = (pr[c] as number) / (pc[c] as number);
      for (let j = c; j <= k; j++) pr[j] = (pr[j] as number) - f * (pc[j] as number);
    }
  }
  return a.map((row, i) => (row[k] as number) / (row[i] as number));
}

const erf = (x: number) => {
  // Abramowitz–Stegun 7.1.26.
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
};
const phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

function report(label: string, rows: readonly Row[], predict: (r: Row) => number, sd: number) {
  const n = rows.length;
  const p = rows.map(predict);
  const my = rows.reduce((s, r) => s + r.y, 0) / n;
  const mp = p.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  let se = 0;
  let ll = 0;
  rows.forEach((r, i) => {
    const pi = p[i] as number;
    sxy += (pi - mp) * (r.y - my);
    sxx += (pi - mp) ** 2;
    syy += (r.y - my) ** 2;
    se += (r.y - pi) ** 2;
    const pm = Math.min(1 - 1e-6, Math.max(1e-6, phi((pi - r.bid) / sd)));
    ll += r.y >= r.bid ? Math.log(pm) : Math.log(1 - pm);
  });
  console.log(
    `  ${label.padEnd(34)} r ${(sxy / Math.sqrt(sxx * syy)).toFixed(3)}  RMSE ${Math.sqrt(se / n).toFixed(1)}k  make/set log loss ${(-ll / n).toFixed(4)}  (n ${n})`,
  );
}

const all = load(files);
const test = process.env.TEST
  ? load([process.env.TEST])
  : all.filter((r) => hash(r.seed) % 5 === 0);
const train = process.env.TEST ? all : all.filter((r) => hash(r.seed) % 5 !== 0);
const allCols = CONTRACT_FEATURES.map((_, i) => i);
const wEst = fit(train, [0, 1]);
const wAll = fit(train, allCols);
const resid = (w: number[], cols: readonly number[], rows: readonly Row[]) =>
  Math.sqrt(
    rows.reduce(
      (s, r) =>
        s + (r.y - cols.reduce((v, c, i) => v + (w[i] as number) * (r.x[c] as number), 0)) ** 2,
      0,
    ) / rows.length,
  );
const sdEst = resid(wEst, [0, 1], train);
const sdAll = resid(wAll, allCols, train);
const lin = (w: number[], cols: readonly number[]) => (r: Row) =>
  cols.reduce((v, c, i) => v + (w[i] as number) * (r.x[c] as number), 0);
console.log(`${train.length} training contracts, ${test.length} held out; λ ${lambda}`);
for (const [name, rows] of [
  ['held out', test],
  ['training', train],
] as const) {
  console.log(name);
  report('calibrated playout (130 + 0.5 est)', rows, (r) => 130 + 0.5 * (r.x[1] as number), 58);
  report(`refit on the estimate (sd ${sdEst.toFixed(1)})`, rows, lin(wEst, [0, 1]), sdEst);
  report(`all features (sd ${sdAll.toFixed(1)})`, rows, lin(wAll, allCols), sdAll);
}
console.log('weights:');
CONTRACT_FEATURES.forEach((f, i) => {
  console.log(`  ${f.padEnd(26)} ${(wAll[i] as number).toFixed(3)}`);
});

if (process.env.WRITE === '1') {
  const w = fit(all, allCols);
  const sd = resid(w, allCols, all);
  const out = new URL('../../bots/src/contract/generated/contractModel.ts', import.meta.url)
    .pathname;
  const source = `linear fit (ridge λ ${lambda}) on ${all.length} contracts from ${files.map((f) => f.split('/').pop()).join(', ')}${process.env.NOTE ? `; ${process.env.NOTE}` : ''}`;
  writeFileSync(
    out,
    `// Generated by \`packages/sim/scripts/contract-model.ts\`. Do not edit by hand.\n// ${source}.\nimport type { ContractModel } from '../value';\n\nexport const CONTRACT_MODEL: ContractModel = {\n  source: ${JSON.stringify(source)},\n  features: ${JSON.stringify(CONTRACT_FEATURES)},\n  weights: ${JSON.stringify(w.map((v) => Math.round(v * 1e5) / 1e5))},\n  sd: ${Math.round(sd * 100) / 100},\n};\n`,
  );
  console.log(`wrote ${out} (${CONTRACT_FEATURE_COUNT} features, sd ${sd.toFixed(1)}k)`);
}
