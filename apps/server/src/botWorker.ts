import { parentPort } from 'node:worker_threads';
import { createBot, type Difficulty } from '@mam/bots';
import { type Observation, Rng } from '@mam/engine';

if (!parentPort) throw new Error('botWorker must run as a worker thread');
const port = parentPort;

port.on(
  'message',
  async (msg: { id: number; difficulty: Difficulty; obs: Observation; seed: number }) => {
    try {
      const action = await createBot(msg.difficulty).decide(msg.obs, Rng.fromSeed(msg.seed));
      port.postMessage({ id: msg.id, action });
    } catch (e) {
      port.postMessage({ id: msg.id, error: e instanceof Error ? e.stack : String(e) });
    }
  },
);
