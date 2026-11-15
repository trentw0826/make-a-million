import { describe, expect, it } from 'vitest';
import { replay } from '../src/replay';
import { playRandomGame } from './helpers';

describe('replay', () => {
  it('rebuilds the identical final state from seed and actions', () => {
    const game = playRandomGame('replay-me');
    const record = game.recorder.toRecord();
    expect(record.actions.length).toBe(game.steps);
    const replayed = replay(record);
    expect(replayed.state).toEqual(game.state);
    expect(replayed.events).toEqual(game.events);
  });

  it('survives a JSON round trip', () => {
    const game = playRandomGame('json');
    const record = JSON.parse(JSON.stringify(game.recorder.toRecord()));
    expect(replay(record).state).toEqual(game.state);
  });

  it('rejects an illegal action in the record', () => {
    const game = playRandomGame('bad-record');
    const record = game.recorder.toRecord();
    const broken = {
      ...record,
      actions: [{ seat: 0 as const, action: { type: 'pass' as const } }, ...record.actions],
    };
    expect(() => replay(broken)).toThrow(/WRONG_PHASE|NOT_YOUR_TURN/);
  });
});
