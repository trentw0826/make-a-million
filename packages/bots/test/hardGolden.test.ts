import {
  type Action,
  applyActionOrThrow,
  createGame,
  type GameState,
  legalMoves,
  observe,
  Rng,
  SEATS,
  type Seat,
} from '@mam/engine';
import { describe, expect, it } from 'vitest';
import { HARD_DEFAULTS, HardBot } from '../src/hard/index';
import { HeuristicBot } from '../src/heuristic/index';

/**
 * Hard is live at the table and is the frozen baseline for Expert's work: its decisions
 * must stay bit-identical through any refactor. Normal drives a fixed set of hands; at
 * every contract decision and at a fixed subset of card plays, Hard (with HARD_DEFAULTS)
 * records what it would do. Normal's action moves the game on, so the observations do not
 * depend on Hard and a change shows up at the decisions it touches.
 *
 * Update the snapshot (`vitest -u`) only for a change that is meant to alter Hard's play.
 */

/** Hand starts: seed, dealer and scores, spread over realistic match positions. */
const STARTS: readonly { seed: string; dealer: Seat; scores: readonly [number, number] }[] = [
  { seed: 'golden-0', dealer: 0, scores: [0, 0] },
  { seed: 'golden-1', dealer: 1, scores: [350_000, 120_000] },
  { seed: 'golden-2', dealer: 2, scores: [610_000, 780_000] },
  { seed: 'golden-3', dealer: 3, scores: [-175_000, 240_000] },
  { seed: 'golden-4', dealer: 0, scores: [880_000, 905_000] },
  { seed: 'golden-5', dealer: 1, scores: [455_000, 455_000] },
  { seed: 'golden-6', dealer: 2, scores: [90_000, 640_000] },
  { seed: 'golden-7', dealer: 3, scores: [720_000, 300_000] },
];

/** Extra hands driven only through the auction, discard and trump: more contract decisions. */
const CONTRACT_STARTS = Array.from({ length: 24 }, (_, i) => ({
  seed: `golden-contract-${i}`,
  dealer: (i % 4) as Seat,
  scores: [((i * 137) % 9) * 100_000, ((i * 61) % 9) * 100_000] as const,
}));

function encode(a: Action): string {
  switch (a.type) {
    case 'bid':
      return `bid ${a.amount}`;
    case 'discard':
      return `discard ${[...a.cardIds].sort((x, y) => x - y).join(',')}`;
    case 'nameTrump':
      return `trump ${a.suit}`;
    case 'playCard':
      return `play ${a.cardId}`;
    default:
      return a.type;
  }
}

function record(
  starts: typeof STARTS,
  stopAtPlay: boolean,
  playEvery: number,
): { decisions: string[]; kinds: Set<string> } {
  const hard = new HardBot(HARD_DEFAULTS);
  const normal = new HeuristicBot();
  const decisions: string[] = [];
  const kinds = new Set<string>();
  for (const start of starts) {
    let state: GameState = createGame(start);
    const drive = Rng.fromSeed(`${start.seed}:normal`);
    for (let step = 0; step < 200; step++) {
      const phase = state.hand?.phase;
      if (!phase || phase === 'hand-complete' || state.phase === 'game-over') break;
      if (stopAtPlay && phase === 'playing') break;
      const seat = SEATS.find((s) => legalMoves(state, s).kind !== 'none');
      if (seat === undefined) break;
      const obs = observe(state, seat);
      const kind = obs.legal.kind;
      const isPlay = kind === 'play';
      const choice = isPlay && obs.legal.kind === 'play' && obs.legal.cardIds.length > 1;
      if (!isPlay || (choice && step % playEvery === 0)) {
        const label = kind === 'bid' && obs.legal.canCallMisdeal ? 'bid/misdeal' : kind;
        kinds.add(label);
        const action = hard.decide(obs, Rng.fromSeed(`${start.seed}:hard:${step}`));
        decisions.push(`${start.seed} ${step} ${label}: ${encode(action)}`);
      }
      state = applyActionOrThrow(state, seat, normal.decide(obs, drive)).state;
    }
  }
  return { decisions, kinds };
}

describe('Hard golden decisions', () => {
  it('makes the recorded choice at every sampled decision', async () => {
    const full = record(STARTS, false, 3);
    const contract = record(CONTRACT_STARTS, true, 1);
    for (const k of ['bid', 'bid/misdeal', 'discard', 'trump', 'play']) {
      expect(new Set([...full.kinds, ...contract.kinds])).toContain(k);
    }
    const all = [...full.decisions, ...contract.decisions];
    expect(all.length).toBeGreaterThan(200);
    await expect(`${all.join('\n')}\n`).toMatchFileSnapshot('./__snapshots__/hardGolden.txt');
  }, 600_000);
});
