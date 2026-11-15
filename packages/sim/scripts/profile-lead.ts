// Times the Hard bot's PIMC on opening leads, with node counts and world counts.
// Usage: tsx scripts/profile-lead.ts [deals]
import { HardBot, HeuristicBot, pimcValues } from '@mam/bots';
import {
  applyActionOrThrow,
  createGame,
  type GameState,
  legalMoves,
  observe,
  Rng,
  SEATS,
} from '@mam/engine';

const deals = Number(process.argv[2] ?? 8);
const normal = new HeuristicBot();
const hard = new HardBot();

for (let d = 0; d < deals; d++) {
  let state: GameState = createGame({ seed: `lead-${d}` });
  const rng = Rng.fromSeed(`lead-${d}`);
  while (state.hand?.phase !== 'playing') {
    const seat = SEATS.find((s) => legalMoves(state, s).kind !== 'none');
    if (seat === undefined) throw new Error('stuck');
    state = applyActionOrThrow(state, seat, normal.decide(observe(state, seat), rng)).state;
  }
  const seat = state.hand.turn;
  if (seat === null) throw new Error('no turn');
  const obs = observe(state, seat);
  const t0 = performance.now();
  const r = pimcValues(obs, Rng.fromSeed('p'), hard.options);
  const ms = performance.now() - t0;
  console.log(
    `deal ${d}: ${ms.toFixed(0)}ms, worlds ${r.worlds}, nodes ${r.nodes.toLocaleString()}, ${((r.nodes / ms) * 1000).toFixed(0)} nodes/s`,
  );
}
