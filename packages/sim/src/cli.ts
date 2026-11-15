import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createBot, DIFFICULTIES, type Difficulty, isDifficulty } from '@mam/bots';
import { cardById, cardLabel, type GameRecord, replay } from '@mam/engine';
import { playGame } from './runner';
import { runTournament } from './tournament';

const USAGE = `Usage:
  sim tournament --a <difficulty> --b <difficulty> [--games N] [--seed S] [--json]
  sim invariants [--games N] [--seed S]
  sim bench [--games N] [--seed S]
  sim replay <file.json>

Difficulties: ${DIFFICULTIES.join(', ')}`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv[0] === '--' ? argv.slice(1) : argv;
  switch (command) {
    case 'tournament':
      return tournament(rest);
    case 'invariants':
      return invariants(rest);
    case 'bench':
      return bench(rest);
    case 'replay':
      return replayFile(rest);
    default:
      console.error(USAGE);
      return command === undefined || command === '--help' ? 0 : 1;
  }
}

function difficulty(value: string | undefined, fallback: Difficulty): Difficulty {
  if (value === undefined) return fallback;
  if (!isDifficulty(value)) throw new Error(`unknown difficulty "${value}"`);
  return value;
}

async function tournament(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      a: { type: 'string' },
      b: { type: 'string' },
      games: { type: 'string', default: '200' },
      seed: { type: 'string', default: 'tournament' },
      json: { type: 'boolean', default: false },
    },
  });
  const a = difficulty(values.a, 'normal');
  const b = difficulty(values.b, 'easy');
  const games = Number(values.games);
  const result = await runTournament({
    a: () => createBot(a),
    b: () => createBot(b),
    games,
    seed: values.seed ?? 'tournament',
    ...(values.json
      ? {}
      : {
          onGame: (i: number) => {
            if ((i + 1) % 25 === 0) console.error(`  ${i + 1}/${games} games…`);
          },
        }),
  });
  if (values.json) {
    const { summaries, ...summary } = result;
    console.log(JSON.stringify({ a, b, ...summary }, null, 2));
  } else {
    console.log(
      `${a} (A) vs ${b} (B): ${result.games} games in ${(result.elapsedMs / 1000).toFixed(1)}s`,
    );
    console.log(`  A wins ${result.winsA}  (${(result.winRateA * 100).toFixed(1)}%)`);
    console.log(`  B wins ${result.winsB}`);
    console.log(`  mean margin A−B: ${Math.round(result.meanMargin).toLocaleString()}`);
    console.log(`  mean hands per game: ${result.meanHands.toFixed(1)}`);
  }
  return 0;
}

async function invariants(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      games: { type: 'string', default: '200' },
      seed: { type: 'string', default: 'invariants' },
    },
  });
  const games = Number(values.games);
  const started = performance.now();
  for (let i = 0; i < games; i++) {
    const mix = i % 3 === 0 ? 'easy' : 'normal';
    await playGame({
      seed: `${values.seed}:${i}`,
      strategies: [createBot(mix), createBot('normal'), createBot('easy'), createBot(mix)],
      checkInvariants: true,
    });
    if ((i + 1) % 50 === 0) console.error(`  ${i + 1}/${games} games…`);
  }
  console.log(
    `${games} games, no invariant violations, ${((performance.now() - started) / 1000).toFixed(1)}s`,
  );
  return 0;
}

async function bench(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      games: { type: 'string', default: '50' },
      seed: { type: 'string', default: 'bench' },
    },
  });
  const games = Number(values.games);
  const started = performance.now();
  let steps = 0;
  for (let i = 0; i < games; i++) {
    const outcome = await playGame({
      seed: `${values.seed}:${i}`,
      strategies: [
        createBot('normal'),
        createBot('normal'),
        createBot('normal'),
        createBot('normal'),
      ],
    });
    steps += outcome.steps;
  }
  const ms = performance.now() - started;
  console.log(
    `${games} games, ${steps} actions in ${(ms / 1000).toFixed(2)}s: ${(ms / games).toFixed(1)} ms/game, ${((ms * 1000) / steps).toFixed(0)} µs/action`,
  );
  return 0;
}

async function replayFile(args: string[]): Promise<number> {
  const file = args[0];
  if (!file) {
    console.error(USAGE);
    return 1;
  }
  const record = JSON.parse(readFileSync(file, 'utf8')) as GameRecord;
  const { state, events } = replay(record);
  for (const event of events) {
    switch (event.type) {
      case 'handStarted':
        console.log(
          `\n=== Hand ${event.handNumber} (dealer ${event.dealer}${event.redeals ? `, redeal ${event.redeals}` : ''}) ===`,
        );
        break;
      case 'bid':
        console.log(`seat ${event.seat} bids ${event.amount.toLocaleString()}`);
        break;
      case 'pass':
        console.log(`seat ${event.seat} passes`);
        break;
      case 'auctionWon':
        console.log(`seat ${event.seat} wins the auction at ${event.amount.toLocaleString()}`);
        break;
      case 'trumpNamed':
        console.log(`trump: ${event.suit}`);
        break;
      case 'cardPlayed':
        console.log(`  seat ${event.seat}: ${cardLabel(cardById(event.cardId))}`);
        break;
      case 'trickWon':
        console.log(`  → trick ${event.trickIndex + 1} to seat ${event.seat}`);
        break;
      case 'handScored':
        console.log(
          `hand result: captured ${event.result.captured.join(' / ')}, bid ${event.result.made ? 'made' : 'SET'}, scores ${event.result.scoresAfter.join(' / ')}`,
        );
        break;
      case 'gameOver':
        console.log(`\nGAME OVER: team ${event.winner} wins ${state.scores.join(' / ')}`);
        break;
      default:
        break;
    }
  }
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
