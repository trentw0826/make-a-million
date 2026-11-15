import { Rng } from '@mam/engine';
import { ME_TABLE } from '@mam/search';
import { describe, expect, it } from 'vitest';
import { makeBoards, runDuplicate } from '../src/duplicate';
import { buildTable, type EquitySample } from '../src/matchEquity';
import { RunningStats, Sprt } from '../src/stats';
import { parseSpec } from '../src/strategies';

describe('Sprt', () => {
  it('accepts H1 for a clearly positive mean', () => {
    const rng = Rng.fromSeed('sprt-h1');
    const sprt = new Sprt({ mu0: 0, mu1: 0.05 });
    let decision = sprt.decision();
    for (let i = 0; i < 10_000 && decision === 'continue'; i++) {
      decision = sprt.push(0.1 + (rng.next() - 0.5) * 0.4);
    }
    expect(decision).toBe('H1');
  });

  it('accepts H0 when there is no improvement', () => {
    const rng = Rng.fromSeed('sprt-h0');
    const sprt = new Sprt({ mu0: 0, mu1: 0.05 });
    let decision = sprt.decision();
    for (let i = 0; i < 10_000 && decision === 'continue'; i++) {
      decision = sprt.push((rng.next() - 0.5) * 0.4);
    }
    expect(decision).toBe('H0');
  });

  it('keeps running statistics', () => {
    const s = new RunningStats();
    for (const x of [1, 2, 3, 4]) s.push(x);
    expect(s.mean).toBe(2.5);
    expect(s.variance).toBeCloseTo(5 / 3);
  });
});

describe('buildTable', () => {
  it('is symmetric, monotone and fits the data', () => {
    const rng = Rng.fromSeed('table');
    const samples: EquitySample[] = [];
    for (let i = 0; i < 20_000; i++) {
      const own = Math.round(rng.next() * 1_000_000 - 200_000);
      const opp = Math.round(rng.next() * 1_000_000 - 200_000);
      const p = 1 / (1 + Math.exp(-(own - opp) / 200_000));
      const win = rng.next() < p;
      const ownDeals = rng.next() < 0.5;
      samples.push({ own, opp, ownDeals, win });
      samples.push({ own: opp, opp: own, ownDeals: !ownDeals, win: !win });
    }
    const t = buildTable(samples, { source: 'synthetic', size: 31, step: 50_000, min: -500_000 });
    const v = (d: number, i: number, j: number) => t.values[d * 31 * 31 + i * 31 + j] as number;
    for (let i = 0; i < 31; i++) {
      for (let j = 0; j < 31; j++) {
        expect(v(1, i, j) + v(0, j, i)).toBeCloseTo(1, 3);
        if (i > 0) expect(v(0, i, j)).toBeGreaterThanOrEqual(v(0, i - 1, j));
        if (j > 0) expect(v(0, i, j)).toBeLessThanOrEqual(v(0, i, j - 1));
      }
    }
    // own 500k vs opp 0 → logistic(2.5) ≈ 0.92
    expect(v(0, 20, 10)).toBeGreaterThan(0.85);
    expect(v(0, 20, 10)).toBeLessThan(0.97);
  });
});

describe('runDuplicate', () => {
  const boards = makeBoards(8, 'test', []);

  it('scores identical bots exactly level', async () => {
    const r = await runDuplicate({ a: 'normal', b: 'normal', boards, table: ME_TABLE, workers: 1 });
    expect(r.boards).toBe(8);
    expect(r.me.mean).toBeCloseTo(0, 10);
    expect(r.margin.mean).toBeCloseTo(0, 10);
  });

  it('shows Normal ahead of Easy', async () => {
    const r = await runDuplicate({ a: 'normal', b: 'easy', boards, table: ME_TABLE, workers: 1 });
    expect(r.me.mean).toBeGreaterThan(0);
    expect(r.margin.mean).toBeGreaterThan(0);
  });
});

describe('parseSpec', () => {
  it('reads names and options', () => {
    expect(parseSpec('hard:samples=40,exact')).toEqual({
      name: 'hard',
      options: { samples: '40', exact: 'true' },
    });
    expect(parseSpec('normal')).toEqual({ name: 'normal', options: {} });
  });
});
