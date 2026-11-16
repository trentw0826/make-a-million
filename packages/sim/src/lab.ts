import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ME_TABLE } from '@mam/search';
import { handStarts, makeBoards, runDuplicate } from './duplicate';
import { runMatch } from './match';
import { buildTable, samplesFromGame, writeTableModule } from './matchEquity';
import { defaultWorkers, runParallel } from './parallel';
import type { PlayInput } from './tasks';

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const fmtCi = (ci: readonly [number, number], f: (x: number) => string) =>
  `[${f(ci[0])}, ${f(ci[1])}]`;

/** `sim me-table`: estimate match equity from self-play and regenerate the table module. */
export async function meTableCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      games: { type: 'string', default: '20000' },
      spec: { type: 'string', default: 'normal' },
      seed: { type: 'string', default: 'me-table' },
      workers: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const games = Number(values.games);
  const spec = values.spec ?? 'normal';
  const inputs: PlayInput[] = Array.from({ length: games }, (_, i) => ({
    seed: `${values.seed}:${i}`,
    dealer: (i % 4) as 0 | 1 | 2 | 3,
    specs: [spec, spec, spec, spec],
  }));
  const started = performance.now();
  const outputs = await runParallel('play', inputs, {
    workers: values.workers ? Number(values.workers) : defaultWorkers(),
    onResult: (i) => {
      if ((i + 1) % 2000 === 0) console.error(`  ${i + 1}/${games} games…`);
      return true;
    },
  });
  const samples = outputs.flatMap(samplesFromGame);
  const table = buildTable(samples, {
    source: `${spec} self-play, ${games} games, ${samples.length} samples`,
  });
  const out =
    values.out ?? fileURLToPath(new URL('../../search/src/generated/meTable.ts', import.meta.url));
  writeTableModule(table, out);
  console.log(
    `${samples.length} samples from ${games} games in ${((performance.now() - started) / 1000).toFixed(1)}s → ${out}`,
  );
  const show = (own: number, opp: number, deals: boolean) =>
    `ME(${own / 1000}k, ${opp / 1000}k, ${deals ? 'deal' : 'opp deals'}) = ${pct(
      table.values[
        (deals ? 1 : 0) * table.size * table.size +
          Math.round((own - table.min) / table.step) * table.size +
          Math.round((opp - table.min) / table.step)
      ] as number,
    )}`;
  console.log(`  ${show(0, 0, true)}  ${show(0, 0, false)}`);
  console.log(`  ${show(800_000, 600_000, false)}  ${show(600_000, 800_000, false)}`);
  return 0;
}

/** `sim duplicate`: hand-level duplicate comparison, optionally as an SPRT. */
export async function duplicateCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      a: { type: 'string', default: 'normal' },
      b: { type: 'string', default: 'easy' },
      boards: { type: 'string', default: '400' },
      seed: { type: 'string', default: 'dup' },
      workers: { type: 'string' },
      sprt: { type: 'boolean', default: false },
      delta: { type: 'string', default: '0.01' },
      pool: { type: 'string', default: '300' },
      json: { type: 'boolean', default: false },
    },
  });
  const workers = values.workers ? Number(values.workers) : defaultWorkers();
  const seed = values.seed ?? 'dup';
  // Realistic positions: hand starts from Normal self-play.
  const poolGames = await runParallel(
    'play',
    Array.from({ length: Number(values.pool) }, (_, i) => ({
      seed: `${seed}:pool:${i}`,
      dealer: (i % 4) as 0 | 1 | 2 | 3,
      specs: ['normal', 'normal', 'normal', 'normal'] as const,
    })),
    { workers },
  );
  const boards = makeBoards(Number(values.boards), seed, handStarts(poolGames));
  const a = values.a ?? 'normal';
  const b = values.b ?? 'easy';
  const result = await runDuplicate({
    a,
    b,
    boards,
    table: ME_TABLE,
    workers,
    ...(values.sprt ? { sprt: { mu0: 0, mu1: Number(values.delta) } } : {}),
    onBoard: (i, r) => {
      if (!values.json && (i + 1) % 50 === 0)
        console.error(`  ${i + 1} boards… (last ΔME ${r.me.toFixed(3)})`);
    },
  });
  if (values.json) {
    console.log(JSON.stringify({ a, b, ...result }, null, 2));
    return 0;
  }
  console.log(
    `${a} (A) vs ${b} (B): ${result.boards} duplicate boards in ${(result.elapsedMs / 1000).toFixed(1)}s`,
  );
  console.log(`  ΔME per board: ${pct(result.me.mean)}  95% CI ${fmtCi(result.me.ci95, pct)}`);
  console.log(
    `  Δpoints per hand: ${Math.round(result.margin.mean).toLocaleString()}  95% CI ${fmtCi(result.margin.ci95, (x) => Math.round(x).toLocaleString())}`,
  );
  for (const [label, c] of [
    ['A', result.contractsA],
    ['B', result.contractsB],
  ] as const) {
    console.log(
      `  ${label} declared ${c.contracts}×, made ${c.contracts ? pct(c.made / c.contracts) : '–'}, mean bid ${c.contracts ? Math.round(c.bidTotal / c.contracts).toLocaleString() : '–'}`,
    );
  }
  console.log(
    `  think time A: mean ${result.timingA.meanMs.toFixed(1)}ms max ${result.timingA.maxMs.toFixed(0)}ms · B: mean ${result.timingB.meanMs.toFixed(1)}ms max ${result.timingB.maxMs.toFixed(0)}ms`,
  );
  if (result.sprt) console.log(`  SPRT: ${result.sprt} (LLR ${result.llr?.toFixed(2)})`);
  for (const s of result.slow) {
    console.log(
      `  slow: ${s.spec} ${s.phase} ${s.ms}ms (cards left ${s.cardsLeft}, trick ${s.trickCards}, legal ${s.legal})`,
    );
  }
  return 0;
}

/** `sim match`: full games in duplicate pairs. */
export async function matchCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      a: { type: 'string', default: 'normal' },
      b: { type: 'string', default: 'easy' },
      pairs: { type: 'string', default: '200' },
      seed: { type: 'string', default: 'match' },
      workers: { type: 'string' },
      sprt: { type: 'boolean', default: false },
      delta: { type: 'string', default: '0.05' },
    },
  });
  const a = values.a ?? 'normal';
  const b = values.b ?? 'easy';
  const result = await runMatch({
    a,
    b,
    pairs: Number(values.pairs),
    seed: values.seed ?? 'match',
    workers: values.workers ? Number(values.workers) : defaultWorkers(),
    ...(values.sprt ? { sprt: { mu0: 0, mu1: Number(values.delta) } } : {}),
    onPair: (i) => {
      if ((i + 1) % 50 === 0) console.error(`  ${i + 1} pairs…`);
    },
  });
  console.log(
    `${a} (A) vs ${b} (B): ${result.games} games in ${(result.elapsedMs / 1000).toFixed(1)}s`,
  );
  console.log(`  A wins ${result.winsA} (${pct(result.winRateA)})`);
  console.log(
    `  pair score ${result.pairScore.mean.toFixed(3)}  95% CI ${fmtCi(result.pairScore.ci95, (x) => x.toFixed(3))}`,
  );
  console.log(`  mean hands per game ${result.meanHands.toFixed(1)}`);
  if (result.sprt) console.log(`  SPRT: ${result.sprt}`);
  return 0;
}
