// Paired open-hand check of two specs' discards on a decision bank (OUT files of
// `timing-bank.ts time … discard` on a bank collected with true hands): each discard is worth
// its best trump's open-hand value on the true deal (money won minus the opponents', $1000s,
// for the declaring team), searched DEPTH tricks deep (default 3) plus the greedy playout.
// Prints the mean difference B − A with a 95% interval, over all discards and over those
// where the two differ. Usage: tsx scripts/discard-dd.ts <bank.jsonl> <a.jsonl> <b.jsonl>
import { readFileSync } from 'node:fs';
import { type Action, type CardId, openingLeader, SUITS, teamOf } from '@mam/engine';
import { buildPlayState, Solver } from '@mam/search';
import type { BankEntry } from '../src/bank';
import { RunningStats } from '../src/stats';

const [fBank, fa, fb] = process.argv.slice(2);
if (!fBank || !fa || !fb) throw new Error('usage: discard-dd.ts bank.jsonl a.jsonl b.jsonl');
const depth = Number(process.env.DEPTH ?? 3);
const lines = (f: string) =>
  readFileSync(f, 'utf8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
const bank = new Map<string, BankEntry>(
  (lines(fBank) as BankEntry[]).filter((e) => e.kind === 'discard').map((e) => [e.seed, e]),
);
const actions = (f: string) =>
  new Map<string, Action>(
    (lines(f) as { seed: string; kind: string; action: Action }[])
      .filter((l) => l.kind === 'discard')
      .map((l) => [l.seed, l.action]),
  );
const a = actions(fa);
const b = actions(fb);

const key = (x: Action) =>
  x.type === 'discard' ? [...x.cardIds].sort((p, q) => p - q).join(',') : '';

/** The declaring team's best-trump open-hand value of discarding `discard`. */
function value(e: BankEntry, discard: readonly CardId[]): number {
  const hands = e.hands;
  if (!hands) throw new Error('discard-dd: the bank has no true hands');
  const seat = e.obs.seat;
  const keep = e.obs.hand.filter((c) => !discard.includes(c));
  const sign = teamOf(seat) === 0 ? 1 : -1;
  let best = Number.NEGATIVE_INFINITY;
  for (const trump of SUITS) {
    const state = buildPlayState({
      hands: hands.map((h, s) => (s === seat ? keep : h)),
      trump,
      tricks: [],
      currentTrick: null,
      turn: openingLeader(seat),
    });
    const solver = new Solver({ mode: 'linear', maxEntries: 400_000 });
    solver.depthTricks = depth;
    const { values } = solver.rootValues(state);
    // The leader picks the move best for their own team.
    const leaderSign = teamOf(openingLeader(seat)) === 0 ? 1 : -1;
    const v = leaderSign * Math.max(...values.map((x) => leaderSign * x));
    best = Math.max(best, sign * v);
  }
  return best;
}

const all = new RunningStats();
const differing = new RunningStats();
let n = 0;
const started = Date.now();
for (const [seed, e] of bank) {
  const xa = a.get(seed);
  const xb = b.get(seed);
  if (!xa || !xb || xa.type !== 'discard' || xb.type !== 'discard') continue;
  n++;
  if (key(xa) === key(xb)) {
    all.push(0);
    continue;
  }
  const d = value(e, xb.cardIds) - value(e, xa.cardIds);
  if (process.env.VERBOSE)
    console.log(seed, d.toFixed(1), `${Math.round((Date.now() - started) / 1000)}s`);
  all.push(d);
  differing.push(d);
}
const ci = (s: RunningStats) =>
  `${s.mean.toFixed(2)} [${s.ci95[0].toFixed(2)}, ${s.ci95[1].toFixed(2)}]`;
console.log(
  `${n} discards, ${differing.n} differ (depth ${depth}, ${Math.round((Date.now() - started) / 1000)}s)`,
);
console.log(`  B − A, all ($k):       ${ci(all)}`);
console.log(`  B − A, differing ($k): ${ci(differing)}`);
