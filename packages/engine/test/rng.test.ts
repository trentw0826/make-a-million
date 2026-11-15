import { describe, expect, it } from 'vitest';
import { Rng, seedToState } from '../src/rng';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = Rng.fromSeed('hello');
    const b = Rng.fromSeed('hello');
    for (let i = 0; i < 100; i++) expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it('differs between seeds', () => {
    const a = Rng.fromSeed('one');
    const b = Rng.fromSeed('two');
    const same = Array.from({ length: 20 }, () => a.nextUint32() === b.nextUint32());
    expect(same.every(Boolean)).toBe(false);
  });

  it('accepts numeric seeds', () => {
    expect(seedToState(42)).toEqual(seedToState(42));
    expect(seedToState(42)).not.toEqual(seedToState(43));
  });

  it('can be resumed from a saved state', () => {
    const a = Rng.fromSeed('resume');
    a.nextUint32();
    const b = new Rng(a.state());
    expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it('shuffles into a permutation', () => {
    const rng = Rng.fromSeed('shuffle');
    const items = Array.from({ length: 55 }, (_, i) => i);
    const shuffled = rng.shuffle([...items]);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
    expect(shuffled).not.toEqual(items);
  });

  it('draws integers within range', () => {
    const rng = Rng.fromSeed('int');
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 6000; i++) counts[rng.int(6)] += 1;
    for (const n of counts) expect(n).toBeGreaterThan(800);
  });
});
