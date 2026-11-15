import type { Seat } from '@mam/engine';
import { runParallel } from './parallel';
import { RunningStats, Sprt, type SprtDecision, type SprtOptions } from './stats';
import type { BotSpec } from './strategies';
import type { PlayInput, PlayOutput } from './tasks';

export interface MatchOptions {
  readonly a: BotSpec;
  readonly b: BotSpec;
  /** Number of game pairs; each pair plays the same seed with the teams swapped. */
  readonly pairs: number;
  readonly seed: string;
  readonly workers?: number;
  readonly sprt?: SprtOptions;
  readonly onPair?: (index: number, winsA: number) => void;
}

export interface MatchResult {
  readonly games: number;
  readonly winsA: number;
  readonly winRateA: number;
  /** Per pair: A's wins − 1, in [−1, 1]. */
  readonly pairScore: { mean: number; ci95: readonly [number, number] };
  readonly meanHands: number;
  readonly sprt: SprtDecision | null;
  readonly elapsedMs: number;
}

/** Full games in duplicate pairs: the deal sequence is shared, only the seating changes. */
export async function runMatch(opts: MatchOptions): Promise<MatchResult> {
  const started = performance.now();
  const inputs: PlayInput[] = [];
  for (let k = 0; k < opts.pairs; k++) {
    const seed = `${opts.seed}:${k}`;
    const dealer = (k % 4) as Seat;
    inputs.push({ seed, dealer, specs: [opts.a, opts.b, opts.a, opts.b] });
    inputs.push({ seed, dealer, specs: [opts.b, opts.a, opts.b, opts.a] });
  }
  const pair = new RunningStats();
  const sprt = opts.sprt ? new Sprt(opts.sprt) : null;
  let decision: SprtDecision | null = sprt ? 'continue' : null;
  let winsA = 0;
  let games = 0;
  let hands = 0;
  let first: PlayOutput | null = null;

  await runParallel('play', inputs, {
    ...(opts.workers !== undefined ? { workers: opts.workers } : {}),
    onResult: (index, out) => {
      games += 1;
      hands += out.hands.length;
      if (index % 2 === 0) {
        first = out;
        return true;
      }
      const o0 = first as unknown as PlayOutput;
      const w = (o0.winner === 0 ? 1 : 0) + (out.winner === 1 ? 1 : 0);
      winsA += w;
      pair.push(w - 1);
      opts.onPair?.((index - 1) / 2, w);
      if (sprt) {
        decision = sprt.push(w - 1);
        if (decision !== 'continue') return false;
      }
      return true;
    },
  });

  const played = pair.n * 2;
  return {
    games: played,
    winsA,
    winRateA: played ? winsA / played : 0,
    pairScore: { mean: pair.mean, ci95: pair.ci95 },
    meanHands: games ? hands / games : 0,
    sprt: decision,
    elapsedMs: performance.now() - started,
  };
}
