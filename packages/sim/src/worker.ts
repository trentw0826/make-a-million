import { parentPort } from 'node:worker_threads';
import { runTask, type TaskName } from './tasks';

interface Job {
  readonly id: number;
  readonly name: TaskName;
  readonly input: unknown;
}

if (!parentPort) throw new Error('worker.ts must run as a worker thread');
const port = parentPort;

port.on('message', async (job: Job) => {
  try {
    const output = await runTask(job.name, job.input as never);
    port.postMessage({ id: job.id, ok: true, output });
  } catch (e) {
    port.postMessage({ id: job.id, ok: false, error: e instanceof Error ? e.stack : String(e) });
  }
});
