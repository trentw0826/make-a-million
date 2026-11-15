import { HeuristicBot } from '@mam/bots';
import type { Action, GameState, Observation, Rng, Seat } from '@mam/engine';
import { playStateFromGame, Solver } from '@mam/search';
import type { OracleStrategy } from './strategies';

/**
 * Evaluation-only: plays cards with every hand visible, using the open-hand solver
 * (exact with `exactTricks` or fewer tricks left, otherwise `depth` tricks deep).
 * Contract decisions come from the Normal bot. It measures how much any observation-only
 * bot leaves on the table; it must never be offered for live play.
 */
export class OracleBot implements OracleStrategy {
  readonly id = 'oracle';
  readonly needsState = true as const;
  private readonly heuristic = new HeuristicBot();

  constructor(
    private readonly exactTricks = 7,
    private readonly depth = 3,
  ) {}

  decideWithState(state: GameState, seat: Seat, obs: Observation, rng: Rng): Action {
    if (obs.legal.kind !== 'play') return this.heuristic.decide(obs, rng);
    if (obs.legal.cardIds.length === 1)
      return { type: 'playCard', cardId: obs.legal.cardIds[0] as number };
    const s = playStateFromGame(state);
    const solver = new Solver({ mode: 'linear' });
    if (s.cardsInHands + s.trickCount > this.exactTricks * 4) solver.depthTricks = this.depth;
    const { moves, values } = solver.rootValues(s);
    const team0 = seat % 2 === 0;
    let best = 0;
    for (let i = 1; i < moves.length; i++) {
      const v = values[i] as number;
      if (team0 ? v > (values[best] as number) : v < (values[best] as number)) best = i;
    }
    return { type: 'playCard', cardId: moves[best] as number };
  }
}
