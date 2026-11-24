// Load test: rooms of bots playing at their real reply times on one server's bot worker pool,
// through the server's own rooms (no sockets). Each room seats one human who drops at once, so
// the takeover level plays that seat too: by default the tested level, four searching bots a
// room, the worst case. For each room count it reports every decision's time from request to
// answer (queueing plus thinking) and how many answers came after their deadline, which the
// server logs as "bot answered after its deadline".
// Usage: tsx apps/server/scripts/load-test.ts [difficulty=expert] [rooms=8,16,32] [minutes=10]
//   (env BOT_WORKERS as for the server, TAKEOVER for the dropped human's seat; run on an
//   otherwise idle machine)
import type { Difficulty } from '@mam/protocol';
import { BotPool, type DecideBot } from '../src/botPool';
import { DEFAULT_CONFIG, type ServerConfig } from '../src/config';
import type { Logger } from '../src/log';
import { RoomManager } from '../src/roomManager';

const [levelArg = 'expert', roomsArg = '8,16,32', minutesArg = '10'] = process.argv.slice(2);
const level = levelArg as Difficulty;
const counts = roomsArg.split(',').map(Number);
const minutes = Number(minutesArg);

const config: ServerConfig = {
  ...DEFAULT_CONFIG,
  graceMs: 0,
  roomIdleMs: 24 * 3_600_000,
  takeoverDifficulty: (process.env.TAKEOVER as Difficulty | undefined) ?? level,
};

let times: number[] = [];
let lateBy: number[] = [];
let warnings = 0;
let errors = 0;
const log: Logger = (lvl, message, data) => {
  if (message === 'bot answered after its deadline') warnings++;
  else if (lvl === 'error') {
    errors++;
    console.error(message, data);
  }
};
const pool = new BotPool(config.botWorkers, log);
const decideBot: DecideBot = async (difficulty, obs, seed, deadline) => {
  const t0 = Date.now();
  const action = await pool.decide(difficulty, obs, seed, deadline);
  const now = Date.now();
  if (difficulty === level) {
    times.push(now - t0);
    if (deadline !== undefined && now > deadline) lateBy.push(now - deadline);
  }
  return action;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pct = (sorted: readonly number[], p: number) =>
  sorted.length === 0
    ? 0
    : (sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0);

console.log(
  `${level} rooms, ${config.botWorkers} bot workers, reply time ${config.botDelayMs[level]} ms ` +
    `(deadline ${config.botDelayMs[level] - config.botDeadlineMarginMs} ms), ${minutes} min a step`,
);
console.log('rooms  decisions  /s   p50   p90   p99    max (ms)  late  late%  max late  queue');
for (const n of counts) {
  const manager = new RoomManager({ config, log, send: () => {}, decideBot });
  // Start the rooms spread over a minute or so, so their hands are out of step.
  const stagger = Math.min(5_000, 60_000 / n);
  for (let i = 0; i < n; i++) {
    const id = `load-${n}-${i}`;
    const room = manager.create(id, 'Load');
    room.sit(id, 0);
    for (const seat of [1, 2, 3] as const) room.setBot(id, seat, level);
    room.start(id);
    room.disconnect(id);
    await sleep(stagger);
  }
  times = [];
  lateBy = [];
  warnings = 0;
  let queueMax = 0;
  const end = Date.now() + minutes * 60_000;
  while (Date.now() < end) {
    await sleep(1_000);
    queueMax = Math.max(queueMax, pool.pending);
    for (const room of manager.rooms.values()) {
      if (room.phase === 'finished' && room.hostId) room.playAgain(room.hostId);
    }
  }
  const sorted = [...times].sort((a, b) => a - b);
  const late = lateBy.length;
  console.log(
    [
      String(n).padStart(5),
      String(sorted.length).padStart(10),
      (sorted.length / (minutes * 60)).toFixed(1).padStart(4),
      String(pct(sorted, 0.5)).padStart(5),
      String(pct(sorted, 0.9)).padStart(5),
      String(pct(sorted, 0.99)).padStart(5),
      String(sorted.at(-1) ?? 0).padStart(6),
      String(late).padStart(10),
      ((100 * late) / Math.max(1, sorted.length)).toFixed(2).padStart(6),
      String(Math.max(0, ...lateBy)).padStart(9),
      String(queueMax).padStart(6),
    ].join(' '),
  );
  if (warnings !== late) console.log(`  (the rooms logged ${warnings} late answers)`);
  manager.closeAll();
  while (pool.pending > 0) await sleep(500);
}
if (errors > 0) console.log(`${errors} errors logged`);
await pool.close();
