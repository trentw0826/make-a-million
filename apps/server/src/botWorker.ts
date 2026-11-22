import { parentPort } from 'node:worker_threads';
import { ANALYSIS_DEFAULTS, analyze, createBot, type Difficulty } from '@mam/bots';
import { type CardId, type Observation, Rng } from '@mam/engine';

if (!parentPort) throw new Error('botWorker must run as a worker thread');
const port = parentPort;

/** A bot decision, or a solo analysis (see BotPool). */
export type WorkerJob =
  | {
      id: number;
      kind: 'decide';
      difficulty: Difficulty;
      obs: Observation;
      seed: number;
      deadline?: number;
    }
  | {
      id: number;
      kind: 'analyze';
      obs: Observation;
      seed: number;
      deadline?: number;
      include?: readonly CardId[] | null;
    };

port.on('message', async (msg: WorkerJob) => {
  try {
    if (msg.kind === 'analyze') {
      const analysis = analyze(
        msg.obs,
        Rng.fromSeed(msg.seed),
        ANALYSIS_DEFAULTS,
        msg.deadline,
        msg.include ?? null,
      );
      port.postMessage({ id: msg.id, analysis });
      return;
    }
    const action = await createBot(msg.difficulty).decide(
      msg.obs,
      Rng.fromSeed(msg.seed),
      msg.deadline !== undefined ? { deadline: msg.deadline } : {},
    );
    port.postMessage({ id: msg.id, action });
  } catch (e) {
    port.postMessage({ id: msg.id, error: e instanceof Error ? e.stack : String(e) });
  }
});
