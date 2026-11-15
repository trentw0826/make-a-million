import type { Action } from './actions';
import type { GameEvent } from './events';
import { applyActionOrThrow, createGame } from './reducer';
import type { Ruleset } from './ruleset';
import type { Seat } from './seats';
import type { GameState } from './state';

export interface RecordedAction {
  readonly seat: Seat;
  readonly action: Action;
}

/** Everything needed to reproduce a game exactly. */
export interface GameRecord {
  readonly seed: string;
  readonly ruleset: Ruleset;
  readonly dealer: Seat;
  /** Starting scores, when the game did not start at [0, 0]. */
  readonly scores?: readonly [number, number];
  readonly actions: readonly RecordedAction[];
}

export function replay(record: GameRecord): { state: GameState; events: readonly GameEvent[] } {
  let state = createGame({
    seed: record.seed,
    ruleset: record.ruleset,
    dealer: record.dealer,
    ...(record.scores ? { scores: record.scores } : {}),
  });
  const events: GameEvent[] = [];
  for (const { seat, action } of record.actions) {
    const result = applyActionOrThrow(state, seat, action);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

/** Collects actions as they are applied so a game can be saved and replayed. */
export class Recorder {
  private readonly actions: RecordedAction[] = [];
  constructor(private readonly initial: GameState) {}

  record(seat: Seat, action: Action): void {
    this.actions.push({ seat, action });
  }

  toRecord(): GameRecord {
    return {
      seed: this.initial.seed,
      ruleset: this.initial.ruleset,
      dealer: this.initial.dealer,
      ...(this.initial.initialScores ? { scores: this.initial.initialScores } : {}),
      actions: [...this.actions],
    };
  }
}
