import type { BotStrategy } from '@mam/bots';
import { otherTeam, type Ruleset, type Seat } from '@mam/engine';
import { playGame } from './runner';

export interface TournamentOptions {
  readonly a: () => BotStrategy;
  readonly b: () => BotStrategy;
  readonly games: number;
  readonly seed: string | number;
  readonly ruleset?: Ruleset;
  readonly checkInvariants?: boolean;
  readonly onGame?: (index: number, summary: GameSummary) => void;
}

export interface GameSummary {
  readonly seed: string;
  /** Which team A sat as (0 = seats 0 and 2). */
  readonly teamA: 0 | 1;
  readonly winner: 'a' | 'b';
  readonly scoreA: number;
  readonly scoreB: number;
  readonly hands: number;
  readonly steps: number;
}

export interface TournamentResult {
  readonly games: number;
  readonly winsA: number;
  readonly winsB: number;
  readonly winRateA: number;
  /** Mean of (score A − score B) at game end. */
  readonly meanMargin: number;
  readonly meanHands: number;
  readonly elapsedMs: number;
  readonly summaries: readonly GameSummary[];
}

/**
 * A plays B over `games` games. Sides alternate seats and the first dealer rotates so
 * neither side gets a positional advantage.
 */
export async function runTournament(options: TournamentOptions): Promise<TournamentResult> {
  const started = performance.now();
  const summaries: GameSummary[] = [];
  let winsA = 0;
  let marginSum = 0;
  let handsSum = 0;

  for (let i = 0; i < options.games; i++) {
    const teamA = (i % 2) as 0 | 1;
    const seed = `${options.seed}:${i}`;
    const strategies: [BotStrategy, BotStrategy, BotStrategy, BotStrategy] = [
      teamA === 0 ? options.a() : options.b(),
      teamA === 1 ? options.a() : options.b(),
      teamA === 0 ? options.a() : options.b(),
      teamA === 1 ? options.a() : options.b(),
    ];
    const outcome = await playGame({
      seed,
      strategies,
      dealer: (i % 4) as Seat,
      ...(options.ruleset ? { ruleset: options.ruleset } : {}),
      ...(options.checkInvariants ? { checkInvariants: true } : {}),
    });
    const scoreA = outcome.state.scores[teamA];
    const scoreB = outcome.state.scores[otherTeam(teamA)];
    const winner = outcome.state.winner === teamA ? 'a' : 'b';
    if (winner === 'a') winsA += 1;
    marginSum += scoreA - scoreB;
    handsSum += outcome.state.handHistory.length;
    const summary: GameSummary = {
      seed,
      teamA,
      winner,
      scoreA,
      scoreB,
      hands: outcome.state.handHistory.length,
      steps: outcome.steps,
    };
    summaries.push(summary);
    options.onGame?.(i, summary);
  }

  return {
    games: options.games,
    winsA,
    winsB: options.games - winsA,
    winRateA: options.games === 0 ? 0 : winsA / options.games,
    meanMargin: options.games === 0 ? 0 : marginSum / options.games,
    meanHands: options.games === 0 ? 0 : handsSum / options.games,
    elapsedMs: performance.now() - started,
    summaries,
  };
}
