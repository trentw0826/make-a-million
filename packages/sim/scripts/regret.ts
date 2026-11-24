// Where a bot's card play loses against the all-seeing solver: regret of each chosen card
// against the best card in the true deal, by trick, position in the trick and side.
// Usage: tsx scripts/regret.ts [spec=expert0] [hands=200] [opponent=spec]
//   (env SEED, WORKERS, EXACT=7, DEPTH=3, OUT=lines.jsonl)
// Regret is in the margin between the teams ($1000s): what the seat's team gives up against
// open-hand play from that card on. It mixes the value of hidden information with search error.
import { writeFileSync } from 'node:fs';
import { handStarts, makeBoards } from '../src/duplicate';
import { defaultWorkers, runParallel } from '../src/parallel';
import type { RegretLine } from '../src/regret';
import { RunningStats } from '../src/stats';
import '../src/registry';

const [spec = 'expert0', handsArg = '200', opponent = spec] = process.argv.slice(2);
const count = Number(handsArg);
const seed = process.env.SEED ?? 'regret';
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
const boards = makeBoards(count, seed, handStarts(pool));
const t0 = performance.now();
const results = await runParallel(
  'regret',
  boards.map((b) => ({
    seed: b.seed,
    dealer: b.dealer,
    scores: b.scores,
    hands: 1,
    specs: [spec, opponent, spec, opponent] as const,
    seats: spec === opponent ? ([0, 1, 2, 3] as const) : ([0, 2] as const),
    exactTricks: Number(process.env.EXACT ?? 7),
    depth: Number(process.env.DEPTH ?? 3),
  })),
  { workers },
);
const lines: RegretLine[] = results.flat();
if (process.env.OUT) {
  writeFileSync(process.env.OUT, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
}
// Measured seats per hand: both teams in self-play, one team otherwise.
const teamsPerHand = spec === opponent ? 2 : 1;
const teamHands = count * teamsPerHand;
console.log(
  `${spec} (opponent ${opponent}): ${lines.length} decisions in ${count} hands, ${((performance.now() - t0) / 1000).toFixed(0)}s`,
);

function row(label: string, ls: readonly RegretLine[]): void {
  const r = new RunningStats();
  for (const l of ls) r.push(l.regretK);
  const perHand = (r.mean * r.n) / teamHands;
  const errors = ls.filter((l) => l.regretK > 0).length;
  console.log(
    `  ${label.padEnd(26)} ${String(r.n).padStart(6)}  ${r.mean.toFixed(2).padStart(6)} ±${(1.96 * r.stderr).toFixed(2).padEnd(5)}  ${((100 * errors) / Math.max(1, r.n)).toFixed(1).padStart(5)}%  ${perHand.toFixed(1).padStart(6)}`,
  );
}
console.log(
  `  ${'decisions'.padEnd(26)} ${'n'.padStart(6)}  ${'mean $k'.padStart(6)} ${'±95%'.padEnd(6)} ${'wrong'.padStart(6)}  per team-hand $k`,
);
row('all', lines);
for (const side of [true, false]) {
  row(
    side ? 'declaring' : 'defending',
    lines.filter((l) => l.declaring === side),
  );
}
for (let p = 0; p < 4; p++) {
  row(
    p === 0 ? 'lead' : `follow ${p + 1}${['', 'nd', 'rd', 'th'][p]}`,
    lines.filter((l) => l.pos === p),
  );
}
for (let t = 0; t < 13; t++) {
  const ls = lines.filter((l) => l.trick === t);
  row(`trick ${t + 1}${ls.some((l) => !l.exact) ? '' : ' (exact)'}`, ls);
}
for (const side of [true, false]) {
  for (const lead of [true, false]) {
    row(
      `${side ? 'declaring' : 'defending'}, ${lead ? 'lead' : 'follow'}`,
      lines.filter((l) => l.declaring === side && (l.pos === 0) === lead),
    );
  }
}
