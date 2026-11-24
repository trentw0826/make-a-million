// Fits the model of how the bots really bid (packages/bots/src/contract/auction.ts) on the
// auctions of natural contract data (scripts/contract-data.ts without FORCED): P(bid | the
// seat's 13 cards, price) as a logistic regression. The opener's forced bid and turns with
// partner holding the high bid are left out. On held-out hands it compares the log loss
// with the heuristic ceilings' model (σ 20k), which the bots use today.
// Usage: tsx scripts/auction-model.ts <natural.jsonl> [more.jsonl ...]  (env WRITE=1, NOTE)
import { readFileSync, writeFileSync } from 'node:fs';
import { AUCTION_FEATURE_COUNT, AUCTION_FEATURES, auctionFeatures } from '@mam/bots';
import { DEFAULT_RULESET, partnerOf, type Seat } from '@mam/engine';
import type { ContractRecord } from '../src/contractData';

const files = process.argv.slice(2);
if (files.length === 0) throw new Error('usage: auction-model.ts natural.jsonl ...');
const { minOpeningBid, raiseIncrement, bidStep } = DEFAULT_RULESET.bidding;

interface Turn {
  readonly x: Float64Array;
  readonly price: number;
  readonly y: 0 | 1;
  readonly heuristic: number;
  readonly hand: string;
}

const turns: Turn[] = [];
for (const f of files) {
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line) as ContractRecord;
    let high = 0;
    let highSeat: Seat | null = null;
    const bidders = new Set<Seat>();
    for (const e of r.auction) {
      const forced = high === 0 && DEFAULT_RULESET.bidding.openerMustBid;
      const partnerHigh = highSeat !== null && highSeat === partnerOf(e.seat);
      if (!forced && !partnerHigh) {
        const hand = r.hands[e.seat] ?? [];
        const partnerBid = bidders.has(partnerOf(e.seat));
        const x = auctionFeatures(hand, partnerBid, bidStep);
        turns.push({
          x,
          price: (high === 0 ? minOpeningBid : high + raiseIncrement) / 100_000,
          y: e.kind === 'bid' ? 1 : 0,
          heuristic: x[3] as number,
          hand: r.seed,
        });
      }
      if (e.kind === 'bid') {
        high = e.amount;
        highSeat = e.seat;
        bidders.add(e.seat);
      }
    }
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const test = turns.filter((t) => hash(t.hand) % 5 === 0);
const train = turns.filter((t) => hash(t.hand) % 5 !== 0);

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
/** Parameters: the feature weights, then the price weight (entering as −k × price). */
const score = (p: readonly number[], t: Turn) => {
  let z = 0;
  for (let i = 0; i < AUCTION_FEATURE_COUNT; i++) z += (p[i] as number) * (t.x[i] as number);
  return z - (p[AUCTION_FEATURE_COUNT] as number) * t.price;
};

function fit(data: readonly Turn[]): number[] {
  const k = AUCTION_FEATURE_COUNT + 1;
  const p = new Array<number>(k).fill(0);
  p[k - 1] = 1;
  const m = new Array<number>(k).fill(0);
  const v = new Array<number>(k).fill(0);
  for (let epoch = 1; epoch <= 3000; epoch++) {
    const g = new Array<number>(k).fill(0);
    for (const t of data) {
      const r = t.y - sigmoid(score(p, t));
      for (let i = 0; i < AUCTION_FEATURE_COUNT; i++)
        g[i] = (g[i] as number) + r * (t.x[i] as number);
      g[k - 1] = (g[k - 1] as number) - r * t.price;
    }
    for (let i = 0; i < k; i++) {
      const gi = (g[i] as number) / data.length - 0.001 * (p[i] as number);
      m[i] = 0.9 * (m[i] as number) + 0.1 * gi;
      v[i] = 0.999 * (v[i] as number) + 0.001 * gi * gi;
      p[i] =
        (p[i] as number) +
        (0.05 * (m[i] as number)) /
          (1 - 0.9 ** epoch) /
          (Math.sqrt((v[i] as number) / (1 - 0.999 ** epoch)) + 1e-8);
    }
  }
  return p;
}

const logLoss = (data: readonly Turn[], prob: (t: Turn) => number) =>
  -data.reduce((s, t) => {
    const q = Math.min(1 - 1e-9, Math.max(1e-9, prob(t)));
    return s + (t.y ? Math.log(q) : Math.log(1 - q));
  }, 0) / data.length;
const p = fit(train);
// The heuristic model: logistic(2 × (ceiling − price) / 20k), prices in $100k.
const heuristic = (t: Turn) => sigmoid((2 * (t.heuristic - t.price)) / 0.2);
const base = train.reduce((s, t) => s + t.y, 0) / train.length;
console.log(
  `${train.length} training turns, ${test.length} held out; bid rate ${(100 * base).toFixed(1)}%`,
);
for (const [name, data] of [
  ['held out', test],
  ['training', train],
] as const) {
  console.log(
    `  ${name.padEnd(9)} log loss: fitted ${logLoss(data, (t) => sigmoid(score(p, t))).toFixed(4)}, heuristic ceilings ${logLoss(data, heuristic).toFixed(4)}, constant rate ${logLoss(data, () => base).toFixed(4)}`,
  );
}
AUCTION_FEATURES.forEach((f, i) => {
  console.log(`  ${f.padEnd(20)} ${(p[i] as number).toFixed(3)}`);
});
const k = p[AUCTION_FEATURE_COUNT] as number;
console.log(
  `  price weight ${k.toFixed(3)} per $100k: σ ${((2 * 100_000) / k / 1000).toFixed(1)}k`,
);

if (process.env.WRITE === '1') {
  const all = fit(turns);
  const out = new URL('../../bots/src/contract/generated/auctionModel.ts', import.meta.url)
    .pathname;
  const source = `logistic fit on ${turns.length} auction turns from ${files.map((f) => f.split('/').pop()).join(', ')}${process.env.NOTE ? `; ${process.env.NOTE}` : ''}`;
  writeFileSync(
    out,
    `// Generated by \`packages/sim/scripts/auction-model.ts\`. Do not edit by hand.\n// ${source}.\nimport type { AuctionModel } from '../auction';\n\nexport const AUCTION_MODEL: AuctionModel = {\n  source: ${JSON.stringify(source)},\n  features: ${JSON.stringify(AUCTION_FEATURES)},\n  weights: ${JSON.stringify(all.slice(0, AUCTION_FEATURE_COUNT).map((x) => Math.round(x * 1e4) / 1e4))},\n  priceWeight: ${Math.round((all[AUCTION_FEATURE_COUNT] as number) * 1e4) / 1e4},\n};\n`,
  );
  console.log(`wrote ${out}`);
}
