// Runs a list of duplicate SPRT experiments in sequence and appends results as JSON lines.
// Usage: tsx scripts/experiments.ts <out.jsonl> "A|B" ["A|B" ...]  (env BOARDS, DELTA, SEED)
import { appendFileSync } from 'node:fs';
import { ME_TABLE } from '@mam/search';
import { handStarts, makeBoards, runDuplicate } from '../src/duplicate';
import { defaultWorkers, runParallel } from '../src/parallel';
import '../src/registry';

const [out, ...pairs] = process.argv.slice(2);
if (!out || pairs.length === 0) throw new Error('usage: experiments.ts out.jsonl "A|B" ...');
const boardsN = Number(process.env.BOARDS ?? 600);
const delta = Number(process.env.DELTA ?? 0.01);
const seed = process.env.SEED ?? 'exp';
const workers = defaultWorkers();

const pool = await runParallel(
  'play',
  Array.from({ length: 300 }, (_, i) => ({
    seed: `${seed}:pool:${i}`,
    dealer: (i % 4) as 0 | 1 | 2 | 3,
    specs: ['normal', 'normal', 'normal', 'normal'] as const,
  })),
  { workers },
);
const boards = makeBoards(boardsN, seed, handStarts(pool));

for (const pair of pairs) {
  const [a, b] = pair.split('|');
  if (!a || !b) throw new Error(`bad pair ${pair}`);
  const r = await runDuplicate({
    a,
    b,
    boards,
    table: ME_TABLE,
    workers,
    sprt: { mu0: 0, mu1: delta },
  });
  const line = {
    a,
    b,
    boards: r.boards,
    me: r.me,
    margin: r.margin,
    sprt: r.sprt,
    llr: r.llr,
    contractsA: r.contractsA,
    contractsB: r.contractsB,
    timingA: r.timingA,
    timingB: r.timingB,
    seconds: Math.round(r.elapsedMs / 1000),
  };
  appendFileSync(out, `${JSON.stringify(line)}\n`);
  console.log(
    `${a} vs ${b}: ${r.boards} boards, ΔME ${(r.me.mean * 100).toFixed(2)}% [${(r.me.ci95[0] * 100).toFixed(2)}, ${(r.me.ci95[1] * 100).toFixed(2)}], SPRT ${r.sprt}, A mean ${r.timingA.meanMs.toFixed(0)}ms max ${r.timingA.maxMs.toFixed(0)}ms`,
  );
}
