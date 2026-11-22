import { Worker } from 'node:worker_threads';
import { ANALYSIS_DEFAULTS, type Analysis, analyze, createBot, type Difficulty } from '@mam/bots';
import { type Action, type CardId, type Observation, Rng } from '@mam/engine';
import type { WorkerJob } from './botWorker';
import type { Logger } from './log';

/**
 * Computes one bot decision. Inline for cheap bots, on a worker thread for searching ones.
 * `deadline` (Date.now() ms) is when the answer is due; searching bots cut short past it.
 */
export type DecideBot = (
  difficulty: Difficulty,
  obs: Observation,
  seed: number,
  deadline?: number,
) => Promise<Action>;

/**
 * Computes a solo analysis of one seat's observation (see `analyze` in @mam/bots). `include`
 * adds the player's own discard to a discard decision's list.
 */
export type AnalyzeSeat = (
  obs: Observation,
  seed: number,
  deadline?: number,
  include?: readonly CardId[] | null,
) => Promise<Analysis>;

/** Bots that search run off the main thread so they never freeze other rooms. */
const SEARCHING: ReadonlySet<Difficulty> = new Set(['hard', 'expert']);

export function decideInline(
  difficulty: Difficulty,
  obs: Observation,
  seed: number,
  deadline?: number,
): Promise<Action> {
  return Promise.resolve(
    createBot(difficulty).decide(
      obs,
      Rng.fromSeed(seed),
      deadline !== undefined ? { deadline } : {},
    ),
  );
}

export const analyzeInline: AnalyzeSeat = (obs, seed, deadline, include) =>
  Promise.resolve(analyze(obs, Rng.fromSeed(seed), ANALYSIS_DEFAULTS, deadline, include ?? null));

type Job = WorkerJob & {
  resolve(result: Action | Analysis): void;
  reject(err: Error): void;
};

/**
 * A fixed pool of worker threads for searching bots and the solo analysis. Jobs queue when
 * every worker is busy, and a bot's decision goes ahead of any analysis waiting, so the
 * analysis never makes a bot late. Each job is stateless: the observation and a seed are
 * all it depends on.
 */
export class BotPool {
  private readonly idle: Worker[] = [];
  private readonly busy = new Map<Worker, Job>();
  private readonly queue: Job[] = [];
  private nextId = 1;
  private closed = false;

  constructor(
    private readonly size: number,
    private readonly log: Logger,
  ) {
    for (let i = 0; i < size; i++) this.spawn();
  }

  readonly decide: DecideBot = (difficulty, obs, seed, deadline) => {
    if (this.size === 0 || !SEARCHING.has(difficulty)) {
      return decideInline(difficulty, obs, seed, deadline);
    }
    return new Promise<Action>((resolve, reject) => {
      const job: Job = {
        id: this.nextId++,
        kind: 'decide',
        difficulty,
        obs,
        seed,
        ...(deadline !== undefined ? { deadline } : {}),
        resolve: resolve as Job['resolve'],
        reject,
      };
      // Ahead of every analysis job, behind other bots.
      const firstAnalysis = this.queue.findIndex((j) => j.kind === 'analyze');
      if (firstAnalysis < 0) this.queue.push(job);
      else this.queue.splice(firstAnalysis, 0, job);
      this.pump();
    });
  };

  readonly analyze: AnalyzeSeat = (obs, seed, deadline, include) => {
    if (this.size === 0) return analyzeInline(obs, seed, deadline, include);
    return new Promise<Analysis>((resolve, reject) => {
      this.queue.push({
        id: this.nextId++,
        kind: 'analyze',
        obs,
        seed,
        ...(deadline !== undefined ? { deadline } : {}),
        include: include ?? null,
        resolve: resolve as Job['resolve'],
        reject,
      });
      this.pump();
    });
  };

  get pending(): number {
    return this.queue.length + this.busy.size;
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.queue) job.reject(new Error('bot pool closed'));
    this.queue.length = 0;
    const all = [...this.idle, ...this.busy.keys()];
    await Promise.all(all.map((w) => w.terminate()));
  }

  private spawn(): void {
    const ts = import.meta.url.endsWith('.ts');
    const worker = new Worker(new URL(ts ? './botWorker.ts' : './botWorker.js', import.meta.url), {
      execArgv: ts ? ['--import', 'tsx'] : [],
    });
    worker.on(
      'message',
      (msg: { id: number; action?: Action; analysis?: Analysis; error?: string }) => {
        const job = this.busy.get(worker);
        this.busy.delete(worker);
        if (job && job.id === msg.id) {
          const result = msg.action ?? msg.analysis;
          if (result) job.resolve(result);
          else job.reject(new Error(msg.error ?? 'bot worker failed'));
        }
        this.idle.push(worker);
        this.pump();
      },
    );
    worker.on('error', (e) => {
      this.log('error', 'bot worker crashed', { error: String(e) });
      const job = this.busy.get(worker);
      this.busy.delete(worker);
      job?.reject(e instanceof Error ? e : new Error(String(e)));
      if (!this.closed) this.spawn();
    });
    this.idle.push(worker);
  }

  private pump(): void {
    while (!this.closed && this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.pop() as Worker;
      const job = this.queue.shift() as Job;
      this.busy.set(worker, job);
      const { resolve: _resolve, reject: _reject, ...message } = job;
      worker.postMessage(message satisfies WorkerJob);
    }
  }
}
