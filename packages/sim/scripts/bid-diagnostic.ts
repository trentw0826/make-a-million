// How a bot's bidding depends on hand strength: plays only auctions and records each bid
// decision with the bidder's playout estimate on the true deal (heuristic discards/trump).
// Usage: tsx scripts/bid-diagnostic.ts [spec=hard] [auctions=150]  (env SEED)
import { playoutDeclare } from '@mam/bots';
import {
  applyActionOrThrow,
  createGame,
  type GameState,
  legalMoves,
  observe,
  Rng,
  SEATS,
  teamOf,
} from '@mam/engine';
import { makeStrategy } from '../src/strategies';
import '../src/registry';

const [spec = 'hard', countArg = '150'] = process.argv.slice(2);
const count = Number(countArg);
const seed = process.env.SEED ?? 'bid-diagnostic';
const bot = makeStrategy(spec);
if ('needsState' in bot) throw new Error('needs an observation-only bot');

interface Row {
  estimate: number;
  minBid: number;
  high: 'none' | 'partner' | 'opponent';
  bid: boolean;
}
const rows: Row[] = [];
for (let g = 0; g < count; g++) {
  let state: GameState = createGame({ seed: `${seed}:${g}`, dealer: (g % 4) as 0 | 1 | 2 | 3 });
  const hand0 = state.hand;
  if (!hand0) continue;
  const deal = { hands: hand0.hands, widow: hand0.widow };
  const estimates = SEATS.map((s) => (playoutDeclare(deal, s)[teamOf(s)] as number) * 1000);
  let step = 0;
  while (state.hand && (state.hand.phase === 'misdeal-window' || state.hand.phase === 'bidding')) {
    const seat = SEATS.find((s) => legalMoves(state, s).kind !== 'none');
    if (seat === undefined) break;
    const obs = observe(state, seat);
    const action = await bot.decide(obs, Rng.fromSeed(`${seed}:${g}:${step++}`));
    if (obs.legal.kind === 'bid' && obs.legal.canPass) {
      const last = [...obs.auction].reverse().find((e) => e.kind === 'bid');
      const high =
        last === undefined ? 'none' : (last.seat + seat) % 2 === 0 ? 'partner' : 'opponent';
      rows.push({
        estimate: estimates[seat] as number,
        minBid: obs.legal.minBid,
        high,
        bid: action.type === 'bid',
      });
    }
    state = applyActionOrThrow(state, seat, action).state;
    // A misdeal redeals: the estimates no longer describe these cards.
    if (state.hand && state.hand.hands[0].join() !== hand0.hands[0].join()) break;
  }
}

const bands = [-Infinity, 100_000, 150_000, 200_000, 250_000, 300_000, Infinity];
console.log(`${spec}: ${rows.length} optional bid decisions in ${count} auctions`);
for (const high of ['opponent', 'none', 'partner'] as const) {
  const sel = rows.filter((r) => r.high === high);
  if (sel.length === 0) continue;
  console.log(`  standing bid by ${high}: ${sel.length} decisions`);
  for (let i = 0; i + 1 < bands.length; i++) {
    const lo = bands[i] as number;
    const hi = bands[i + 1] as number;
    const b = sel.filter((r) => r.estimate >= lo && r.estimate < hi);
    if (b.length === 0) continue;
    const rate = b.filter((r) => r.bid).length / b.length;
    const minBid = b.reduce((a, r) => a + r.minBid, 0) / b.length;
    console.log(
      `    estimate ${String(Number.isFinite(lo) ? lo / 1000 : '−∞').padStart(4)}..${String(Number.isFinite(hi) ? hi / 1000 : '∞').padEnd(4)}k  n=${String(b.length).padStart(4)}  bid ${(100 * rate).toFixed(0).padStart(3)}%  (mean price $${(minBid / 1000).toFixed(0)}k)`,
    );
  }
}
