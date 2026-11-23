// How well world weighting finds the true holdings: on banked card plays with the true hands
// (scripts/timing-bank.ts collect), draw a pool of worlds from the seat's belief, weight them by
// each scheme, and score the probability the weighted pool gives every unseen card's true
// holder (mean log, overall, for money cards and for the specials), with the effective sample
// size of the weights. Schemes: uniform, the specials model, the policy model, both.
// Usage: tsx scripts/inference-eval.ts <bank.jsonl> [pool=360]  (env EVERY=4, TEMP, MIX)
import { readFileSync } from 'node:fs';
import { makePolicyWeight, makeSpecialsWeight, POLICY_MODEL } from '@mam/bots';
import { type CardId, Rng, type Seat } from '@mam/engine';
import { buildBelief, type World } from '@mam/search';
import type { BankEntry } from '../src/bank';
import { RunningStats } from '../src/stats';

const [file, poolArg = '360'] = process.argv.slice(2);
if (!file) throw new Error('usage: inference-eval.ts bank.jsonl [pool]');
const poolSize = Number(poolArg);
const every = Number(process.env.EVERY ?? 4);
const policyOpts = {
  ...(process.env.TEMP ? { temperature: Number(process.env.TEMP) } : {}),
  ...(process.env.MIX ? { mix: Number(process.env.MIX) } : {}),
};
const MONEY_RANKS = new Set([4, 8, 10, 11, 12]);

const entries = readFileSync(file, 'utf8')
  .split('\n')
  .filter((l) => l.length > 0)
  .map((l) => JSON.parse(l) as BankEntry)
  .filter((e) => e.kind === 'play' && e.hands && e.obs.tricks.length > 0)
  .filter((_, i) => i % every === 0);

type Scheme = 'uniform' | 'specials' | 'policy' | 'both';
const SCHEMES: readonly Scheme[] = ['uniform', 'specials', 'policy', 'both'];
const stats = new Map<string, RunningStats>();
const push = (key: string, x: number) => {
  let s = stats.get(key);
  if (!s) {
    s = new RunningStats();
    stats.set(key, s);
  }
  s.push(x);
};

const t0 = performance.now();
for (const e of entries) {
  const { obs } = e;
  const hands = e.hands as readonly (readonly CardId[])[];
  const belief = buildBelief(obs);
  const rng = Rng.fromSeed(`${e.seed}:inference-eval`);
  const pool: World[] = Array.from({ length: poolSize }, () => belief.sample(rng));
  const specials = makeSpecialsWeight(obs);
  const policy = makePolicyWeight(obs, POLICY_MODEL, policyOpts);
  const truth = new Map<CardId, Seat | 'pile'>();
  for (const c of belief.unseen) {
    const s = ([0, 1, 2, 3] as Seat[]).find(
      (seat) => seat !== obs.seat && hands[seat]?.includes(c),
    );
    truth.set(c, s ?? 'pile');
  }
  const stage =
    obs.tricks.length <= 4 ? 'tricks 2–5' : obs.tricks.length <= 8 ? 'tricks 6–9' : 'tricks 10–13';
  for (const scheme of SCHEMES) {
    const w = pool.map((world) => {
      const a = scheme === 'specials' || scheme === 'both' ? (specials?.(world) ?? 1) : 1;
      const b = scheme === 'policy' || scheme === 'both' ? (policy?.(world) ?? 1) : 1;
      return a * b;
    });
    const total = w.reduce((x, y) => x + y, 0);
    const ess = total ** 2 / w.reduce((x, y) => x + y * y, 0);
    push(`${scheme}|ess`, ess);
    for (const [c, holder] of truth) {
      let p = 0;
      pool.forEach((world, i) => {
        const here = holder === 'pile' ? world.pile.includes(c) : world.hands[holder]?.includes(c);
        if (here) p += w[i] as number;
      });
      const lp = Math.log(Math.max(1e-3, p / total));
      push(`${scheme}|all`, lp);
      push(`${scheme}|${stage}`, lp);
      if (c >= 52) push(`${scheme}|specials`, lp);
      else if (MONEY_RANKS.has(c % 13)) push(`${scheme}|money`, lp);
    }
  }
}
console.log(
  `${entries.length} positions, pool ${poolSize}, ${((performance.now() - t0) / 1000).toFixed(0)}s; policy model: ${POLICY_MODEL.source}`,
);
const cols = ['all', 'money', 'specials', 'tricks 2–5', 'tricks 6–9', 'tricks 10–13'];
console.log(`  ${'scheme'.padEnd(9)} ${cols.map((c) => c.padStart(13)).join('')}   ESS`);
for (const scheme of SCHEMES) {
  const row = cols.map((c) => {
    const s = stats.get(`${scheme}|${c}`);
    return (s ? s.mean.toFixed(4) : '—').padStart(13);
  });
  console.log(
    `  ${scheme.padEnd(9)} ${row.join('')}   ${(stats.get(`${scheme}|ess`)?.mean ?? 0).toFixed(0)}`,
  );
}
console.log("  (mean log-probability of each unseen card's true holder; higher is better)");
