// Plays self-play hands and writes every contract with its whole deal as JSON lines: data
// for contract-value models (scripts/contract-model.ts).
// Usage: tsx scripts/contract-data.ts <out.jsonl> [hands=1000] [spec=hard]  (env SEED, WORKERS,
//   FORCED=1 to script each auction so that a random seat declares: data for every kind of hand)
import { writeFileSync } from 'node:fs';
import type { ContractRecord } from '../src/contractData';
import { handStarts, makeBoards } from '../src/duplicate';
import { defaultWorkers, runParallel } from '../src/parallel';
import '../src/registry';

const [out, handsArg = '1000', spec = 'hard'] = process.argv.slice(2);
if (!out) throw new Error('usage: contract-data.ts out.jsonl [hands] [spec]');
const seed = process.env.SEED ?? 'contracts';
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
const boards = makeBoards(Number(handsArg), seed, handStarts(pool));
const t0 = performance.now();
const results = await runParallel(
  'contractData',
  boards.map((b) => ({
    seed: b.seed,
    dealer: b.dealer,
    scores: b.scores,
    specs: [spec, spec, spec, spec] as const,
    forced: process.env.FORCED === '1',
  })),
  { workers },
);
const records = results.filter((r): r is ContractRecord => r !== null);
writeFileSync(out, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
console.log(
  `${spec}: ${records.length} contracts from ${boards.length} hands in ${((performance.now() - t0) / 1000).toFixed(0)}s → ${out}`,
);
