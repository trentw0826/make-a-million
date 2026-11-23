import { describe, expect, it } from 'vitest';
import { contractDataTask } from '../src/contractData';
import '../src/registry';

describe('contract data', () => {
  it('records the deal, the contract and the capture of a played hand', async () => {
    for (const forced of [false, true]) {
      for (let i = 0; i < 4; i++) {
        const r = await contractDataTask({
          seed: `contract-data-${i}`,
          dealer: (i % 4) as 0 | 1 | 2 | 3,
          specs: ['normal', 'normal', 'normal', 'normal'],
          forced,
        });
        if (!r) throw new Error('no contract');
        expect(r.hands.map((h) => h.length)).toEqual([13, 13, 13, 13]);
        expect(r.widow).toHaveLength(3);
        expect(new Set([...r.hands.flat(), ...r.widow]).size).toBe(55);
        expect(r.discards).toHaveLength(3);
        // The discards come from the declarer's 16 cards.
        const sixteen = new Set([...(r.hands[r.bidder] ?? []), ...r.widow]);
        for (const c of r.discards) expect(sixteen.has(c)).toBe(true);
        expect(r.made).toBe((r.captured[r.bidder % 2] as number) >= r.bid);
      }
    }
  });

  it('a forced auction makes the seed-chosen seat declare, whoever opens', async () => {
    const bidders = new Set<number>();
    for (let i = 0; i < 12; i++) {
      const r = await contractDataTask({
        seed: `forced-${i}`,
        dealer: 0,
        specs: ['normal', 'normal', 'normal', 'normal'],
        forced: true,
      });
      if (!r) throw new Error('no contract');
      bidders.add(r.bidder);
      expect(r.auction.filter((e) => e.kind === 'bid').length).toBeLessThanOrEqual(2);
    }
    expect(bidders.size).toBeGreaterThan(2);
  });
});
