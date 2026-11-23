// Fits the card-play policy model for policy-based inference (packages/bots/src/inference/
// policy.ts): a conditional logit over the legal cards, from the self-play card plays in a
// decision bank collected with actions (scripts/timing-bank.ts collect). Holds out a fifth of
// the plays (by hand) and reports the mean log-likelihood per play against uniform over the
// legal cards, and top-1 accuracy.
// Usage: tsx scripts/policy-model.ts <bank.jsonl> [more.jsonl ...]
//   (env L2=0.001, EPOCHS=400, WRITE=1 to write inference/generated/policyModel.ts from all plays)
import { readFileSync, writeFileSync } from 'node:fs';
import { PLAY_FEATURE_COUNT, PLAY_FEATURES, playFeatures, playProbabilities } from '@mam/bots';
import type { CardId, Trick } from '@mam/engine';
import type { BankEntry } from '../src/bank';

const files = process.argv.slice(2);
if (files.length === 0) throw new Error('usage: policy-model.ts bank.jsonl ...');
const l2 = Number(process.env.L2 ?? 0.001);
const epochs = Number(process.env.EPOCHS ?? 400);

interface Example {
  readonly rows: Float64Array[];
  readonly y: number;
  readonly hand: string;
}

function load(paths: readonly string[]): Example[] {
  const out: Example[] = [];
  for (const f of paths) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (!line) continue;
      const e = JSON.parse(line) as BankEntry;
      const { obs, action } = e;
      if (e.kind !== 'play' || !action || action.type !== 'playCard') continue;
      if (obs.legal.kind !== 'play' || obs.trump === null) continue;
      const legal = obs.legal.cardIds;
      const prefix: Trick = obs.currentTrick ?? {
        leader: obs.seat,
        plays: [],
        suit: null,
        winner: null,
      };
      const played = new Set<CardId>([
        ...obs.tricks.flatMap((t) => t.plays.map((p) => p.cardId)),
        ...prefix.plays.map((p) => p.cardId),
      ]);
      const rows = playFeatures(obs.hand, legal, prefix, obs.trump, obs.seat, played);
      out.push({ rows, y: legal.indexOf(action.cardId), hand: e.seed.replace(/:bank:\d+$/, '') });
    }
  }
  return out;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function logLik(w: readonly number[], data: readonly Example[]): { ll: number; top1: number } {
  const model = { source: '', features: [], weights: w };
  let ll = 0;
  let top1 = 0;
  for (const ex of data) {
    const p = playProbabilities(model, ex.rows);
    ll += Math.log(Math.max(1e-12, p[ex.y] as number));
    let best = 0;
    for (let i = 1; i < p.length; i++) if ((p[i] as number) > (p[best] as number)) best = i;
    if (best === ex.y) top1 += 1;
  }
  return { ll: ll / data.length, top1: top1 / data.length };
}

/** Full-batch Adam on the mean log-likelihood with an L2 penalty. */
function fit(data: readonly Example[]): number[] {
  const k = PLAY_FEATURE_COUNT;
  const w = new Array<number>(k).fill(0);
  const m = new Array<number>(k).fill(0);
  const v = new Array<number>(k).fill(0);
  const lr = 0.05;
  for (let epoch = 1; epoch <= epochs; epoch++) {
    const g = new Array<number>(k).fill(0);
    const model = { source: '', features: [], weights: w };
    for (const ex of data) {
      const p = playProbabilities(model, ex.rows);
      ex.rows.forEach((x, j) => {
        const coef = (j === ex.y ? 1 : 0) - (p[j] as number);
        for (let i = 0; i < k; i++) g[i] = (g[i] as number) + coef * (x[i] as number);
      });
    }
    for (let i = 0; i < k; i++) {
      const gi = (g[i] as number) / data.length - 2 * l2 * (w[i] as number);
      m[i] = 0.9 * (m[i] as number) + 0.1 * gi;
      v[i] = 0.999 * (v[i] as number) + 0.001 * gi * gi;
      const mh = (m[i] as number) / (1 - 0.9 ** epoch);
      const vh = (v[i] as number) / (1 - 0.999 ** epoch);
      w[i] = (w[i] as number) + (lr * mh) / (Math.sqrt(vh) + 1e-8);
    }
  }
  return w;
}

const all = load(files);
const test = all.filter((e) => hash(e.hand) % 5 === 0);
const train = all.filter((e) => hash(e.hand) % 5 !== 0);
const uniform = (data: readonly Example[]) =>
  data.reduce((s, e) => s - Math.log(e.rows.length), 0) / data.length;
const t0 = performance.now();
const w = fit(train);
console.log(
  `${train.length} training plays, ${test.length} held out; L2 ${l2}, ${epochs} epochs, ${((performance.now() - t0) / 1000).toFixed(1)}s`,
);
for (const [name, data] of [
  ['held out', test],
  ['training', train],
] as const) {
  const r = logLik(w, data);
  console.log(
    `  ${name.padEnd(9)} log-likelihood per play ${r.ll.toFixed(4)} (uniform ${uniform(data).toFixed(4)}), top-1 ${(100 * r.top1).toFixed(1)}%`,
  );
}
PLAY_FEATURES.forEach((f, i) => {
  console.log(`  ${f.padEnd(40)} ${(w[i] as number).toFixed(3)}`);
});

if (process.env.WRITE === '1') {
  const wAll = fit(all);
  const out = new URL('../../bots/src/inference/generated/policyModel.ts', import.meta.url)
    .pathname;
  const source = `conditional logit (L2 ${l2}, ${epochs} epochs) on ${all.length} card plays from ${files.map((f) => f.split('/').pop()).join(', ')}${process.env.NOTE ? `; ${process.env.NOTE}` : ''}`;
  writeFileSync(
    out,
    `// Generated by \`packages/sim/scripts/policy-model.ts\`. Do not edit by hand.\n// ${source}.\nimport type { PolicyModel } from '../policy';\n\nexport const POLICY_MODEL: PolicyModel = {\n  source: ${JSON.stringify(source)},\n  features: ${JSON.stringify(PLAY_FEATURES)},\n  weights: ${JSON.stringify(wAll.map((x) => Math.round(x * 1e4) / 1e4))},\n};\n`,
  );
  console.log(`wrote ${out}`);
}
