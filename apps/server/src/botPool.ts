import { Worker } from 'node:worker_threads';
import { createBot, type Difficulty } from '@mam/bots';
import { type Action, type Observation, Rng } from '@mam/engine';
import type { Logger } from './log';

/** Computes one bot decision. Inline for cheap bots, on a worker thread for searching ones. */
export type DecideBot = (difficulty: Difficulty, obs: Observation, seed: number) => Promise<Action>;

/** Bots that search run off the main thread so they never freeze other rooms. */
const SEARCHING: ReadonlySet<Difficulty> = new Set(['hard', 'expert']);

export function decideInline(
  difficulty: Difficulty,
  obs: Observation,
  seed: number,
): Promise<Action> {
  return Promise.resolve(createBot(difficulty).decide(obs, Rng.fromSeed(seed)));
}

interface Job {
  readonly id: number;
  readonly difficulty: Difficulty;
  readonly obs: Observation;
  readonly seed: number;
  resolve(action: Action): void;
  reject(err: Error): void;
}

/**
 * A fixed pool of worker threads for searching bots. Jobs queue when every worker is busy.
 * Each job is stateless: the observation and a seed are all a decision depends on.
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

  readonly decide: DecideBot = (difficulty, obs, seed) => {
    if (this.size === 0 || !SEARCHING.has(difficulty)) return decideInline(difficulty, obs, seed);
    return new Promise<Action>((resolve, reject) => {
      this.queue.push({ id: this.nextId++, difficulty, obs, seed, resolve, reject });
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
    worker.on('message', (msg: { id: number; action?: Action; error?: string }) => {
      const job = this.busy.get(worker);
      this.busy.delete(worker);
      if (job && job.id === msg.id) {
        if (msg.action) job.resolve(msg.action);
        else job.reject(new Error(msg.error ?? 'bot worker failed'));
      }
      this.idle.push(worker);
      this.pump();
    });
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
      worker.postMessage({ id: job.id, difficulty: job.difficulty, obs: job.obs, seed: job.seed });
    }
  }
}
