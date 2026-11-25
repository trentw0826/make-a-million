import {
  ANALYSIS_DEFAULTS,
  type AnalysisOptions,
  analyze,
  EXPERT_DEFAULTS,
  HARD_DEFAULTS,
  HardBot,
  type HardOptions,
} from '@mam/bots';
import { type Action, observe, Rng, type Seat } from '@mam/engine';
import { parseOptions } from './registry';
import { playGame } from './runner';
import { makeStrategy } from './strategies';
import type { PlayInput } from './tasks';

/**
 * Diagnostic: the solo analysis's compute time, position by position, under several sets of
 * options. Bots play the hand; before every action the analysed seat's view is analysed once
 * per variant, as the server does for each view it sends with hints on.
 */
export interface AnalysisVariant {
  readonly label: string;
  /** The search settings the analysis starts from. */
  readonly base: 'hard' | 'expert';
  /** Overrides: analysis keys (positionWorlds, …) or the search's own (worlds, nodes, …). */
  readonly options?: Readonly<Record<string, string>>;
}

export interface AnalysisTimingInput extends PlayInput {
  readonly variants: readonly AnalysisVariant[];
  /** The analysed seat (default 0). */
  readonly seat?: Seat;
  /** Deadline in ms from the start of each analysis (default none). */
  readonly deadlineMs?: number;
  /** Also time this bot making each of the seat's decisions (the last result; 0 ms elsewhere). */
  readonly bot?: 'hard' | 'expert';
}

export interface AnalysisResultLine {
  readonly ms: number;
  readonly winChance: number;
  /** The best option's action, as a key (null: no decision). */
  readonly best: string | null;
  /** Points of each option, by action key. */
  readonly points: Readonly<Record<string, number>>;
}

export interface AnalysisTimingLine {
  /** The decision kind, or "pos:<phase>" when the seat has nothing to decide. */
  readonly kind: string;
  /** Cards still in hands and in the trick. */
  readonly live: number;
  readonly results: readonly AnalysisResultLine[];
}

const BASES = { hard: HARD_DEFAULTS, expert: EXPERT_DEFAULTS } as const;

export function analysisOptions(v: AnalysisVariant): AnalysisOptions {
  const base = BASES[v.base];
  const own: Record<string, string> = {};
  const search: Record<string, string> = {};
  for (const [k, raw] of Object.entries(v.options ?? {})) {
    if (k !== 'search' && k in ANALYSIS_DEFAULTS) own[k] = raw;
    else search[k] = raw;
  }
  const { search: _, ...analysisOwn } = ANALYSIS_DEFAULTS;
  return {
    ...ANALYSIS_DEFAULTS,
    ...parseOptions(analysisOwn, own),
    search: { ...base, ...parseOptions<HardOptions>(base, search) },
  };
}

export function actionKey(a: Action): string {
  switch (a.type) {
    case 'playCard':
      return `c${a.cardId}`;
    case 'bid':
      return 'bid';
    case 'nameTrump':
      return `t${a.suit}`;
    case 'discard':
      return `d${[...a.cardIds].sort((p, q) => p - q).join(',')}`;
    default:
      return a.type;
  }
}

export async function analysisTimingTask(
  input: AnalysisTimingInput,
): Promise<AnalysisTimingLine[]> {
  const strategies = input.specs.map(makeStrategy) as unknown as Parameters<
    typeof playGame
  >[0]['strategies'];
  const seat = input.seat ?? 0;
  const variants = input.variants.map(analysisOptions);
  const out: AnalysisTimingLine[] = [];
  let step = 0;
  await playGame({
    seed: input.seed,
    dealer: input.dealer,
    strategies,
    ...(input.scores ? { scores: input.scores } : {}),
    hands: input.hands ?? 1,
    ...(input.ruleset ? { ruleset: input.ruleset } : {}),
    onDecision: ({ state }) => {
      step += 1;
      const obs = observe(state, seat);
      const deciding = obs.legal.kind !== 'none' && obs.legal.kind !== 'continue';
      const live = obs.handSizes.reduce((a, b) => a + b, 0) + (obs.currentTrick?.plays.length ?? 0);
      const results = variants.map((opts): AnalysisResultLine => {
        const rng = Rng.fromSeed(`${input.seed}:analysis:${step}`);
        const started = performance.now();
        const deadline =
          input.deadlineMs === undefined ? Number.POSITIVE_INFINITY : Date.now() + input.deadlineMs;
        const a = analyze(obs, rng, opts, deadline);
        const ms = performance.now() - started;
        const points: Record<string, number> = {};
        for (const o of a.decision?.options ?? []) points[actionKey(o.action)] = o.points;
        const best = a.decision?.options[a.decision.best];
        return {
          ms: Math.round(ms * 10) / 10,
          winChance: a.winChance,
          best: best ? actionKey(best.action) : null,
          points,
        };
      });
      if (input.bot) {
        let ms = 0;
        let best: string | null = null;
        if (deciding) {
          const bot = new HardBot(BASES[input.bot]);
          const started = performance.now();
          best = actionKey(bot.decide(obs, Rng.fromSeed(`${input.seed}:bot:${step}`)));
          ms = performance.now() - started;
        }
        results.push({ ms: Math.round(ms * 10) / 10, winChance: 0, best, points: {} });
      }
      out.push({ kind: deciding ? obs.legal.kind : `pos:${obs.phase}`, live, results });
    },
  });
  return out;
}
