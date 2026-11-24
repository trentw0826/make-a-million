import { applyAction, createGame, observe } from '@mam/engine';
import { describe, expect, it } from 'vitest';
import { bankTask, decideTask } from '../src/bank';
import '../src/registry';

describe('decision bank', () => {
  it('collects every decision with a choice, each with its own seed', async () => {
    const entries = await bankTask({
      seed: 'bank-test',
      dealer: 0,
      specs: ['normal', 'normal', 'normal', 'normal'],
      hands: 1,
    });
    const kinds = new Set(entries.map((e) => e.kind));
    for (const k of ['bid', 'discard', 'trump', 'play']) expect(kinds).toContain(k);
    expect(new Set(entries.map((e) => e.seed)).size).toBe(entries.length);
    for (const e of entries) {
      expect(e.kind === 'misdeal' ? 'bid' : e.kind).toBe(e.obs.legal.kind);
      if (e.kind === 'play') expect(e.legal).toBeGreaterThan(1);
    }
  });

  it('times a legal, reproducible decision on a banked observation', async () => {
    const state = createGame({ seed: 'bank-decide' });
    const entry = { kind: 'bid', live: 52, legal: 0, seed: 's', obs: observe(state, 1) };
    const a = await decideTask({ spec: 'normal', entry });
    const b = await decideTask({ spec: 'normal', entry, deadlineMs: 1000 });
    expect(a.action).toEqual(b.action);
    expect(a.ms).toBeGreaterThanOrEqual(0);
    expect(applyAction(state, 1, a.action).ok).toBe(true);
  });

  it('refuses an oracle, which needs the game state', async () => {
    const entry = {
      kind: 'bid',
      live: 52,
      legal: 0,
      seed: 's',
      obs: observe(createGame({ seed: 'x' }), 1),
    };
    await expect(decideTask({ spec: 'oracle', entry })).rejects.toThrow(/game state/);
  });
});
