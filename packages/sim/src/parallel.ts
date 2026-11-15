import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { runTask, type TaskInput, type TaskName, type TaskOutput } from './tasks';

export interface ParallelOptions<R> {
  /** Worker threads to use; 1 runs everything in this thread. Default: cores − 1. */
  readonly workers?: number;
  /**
   * Called with results strictly in input order (results that finish early are held back),
   * so anything computed from the stream is deterministic. Return false to stop early.
   */
  readonly onResult?: (index: number, result: R) => boolean | undefined;
}

export function defaultWorkers(): number {
  return Math.max(1, availableParallelism() - 1);
}

/**
 * Runs one task per input across worker threads. Worker threads load the TypeScript sources
 * through tsx, so this works from `pnpm sim` without a build step.
 */
export async function runParallel<N extends TaskName>(
  name: N,
  inputs: readonly TaskInput<N>[],
  options: ParallelOptions<TaskOutput<N>> = {},
): Promise<TaskOutput<N>[]> {
  const count = Math.min(options.workers ?? defaultWorkers(), inputs.length);
  const results: TaskOutput<N>[] = new Array(inputs.length);
  const done: boolean[] = new Array(inputs.length).fill(false);
  let delivered = 0;
  let stopped = false;

  const deliver = () => {
    while (delivered < inputs.length && done[delivered] && !stopped) {
      const keepGoing = options.onResult?.(delivered, results[delivered] as TaskOutput<N>);
      delivered += 1;
      if (keepGoing === false) stopped = true;
    }
  };

  if (count <= 1) {
    for (let i = 0; i < inputs.length && !stopped; i++) {
      results[i] = await runTask(name, inputs[i] as TaskInput<N>);
      done[i] = true;
      deliver();
    }
    return results.slice(0, delivered);
  }

  await new Promise<void>((resolve, reject) => {
    let next = 0;
    let active = 0;
    const workers: Worker[] = [];
    const finish = (err?: unknown) => {
      for (const w of workers) void w.terminate();
      if (err) reject(err);
      else resolve();
    };
    const feed = (w: Worker) => {
      if (stopped || next >= inputs.length) {
        if (active === 0) finish();
        return;
      }
      const id = next++;
      active += 1;
      w.postMessage({ id, name, input: inputs[id] });
    };
    for (let k = 0; k < count; k++) {
      const w = new Worker(new URL('./worker.ts', import.meta.url), {
        execArgv: ['--import', 'tsx'],
      });
      workers.push(w);
      w.on('message', (msg: { id: number; ok: boolean; output?: unknown; error?: string }) => {
        active -= 1;
        if (!msg.ok) {
          finish(new Error(`task ${name} #${msg.id} failed: ${msg.error}`));
          return;
        }
        results[msg.id] = msg.output as TaskOutput<N>;
        done[msg.id] = true;
        deliver();
        feed(w);
      });
      w.on('error', (e) => finish(e));
      feed(w);
    }
  });
  return results.slice(0, delivered);
}
