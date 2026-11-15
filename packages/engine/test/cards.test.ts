import { describe, expect, it } from 'vitest';
import {
  BEAR_ID,
  BULL_ID,
  cardById,
  cardLabel,
  DECK,
  DECK_SIZE,
  effectiveSuit,
  isMoney,
  isNumberCard,
  isTrump,
  moneyValue,
  RANKS,
  rankIndex,
  SUITS,
  sumMoney,
  TIGER_ID,
  TOTAL_MONEY,
} from '../src/cards';
import { c } from './helpers';

describe('deck composition', () => {
  it('has 55 cards: 52 suit cards plus Tiger, Bull and Bear', () => {
    expect(DECK).toHaveLength(DECK_SIZE);
    expect(DECK.filter((card) => card.kind === 'suit')).toHaveLength(52);
    expect(cardById(TIGER_ID).kind).toBe('tiger');
    expect(cardById(BULL_ID).kind).toBe('bull');
    expect(cardById(BEAR_ID).kind).toBe('bear');
  });

  it('gives every card a unique id equal to its index', () => {
    for (const [i, card] of DECK.entries()) expect(card.id).toBe(i);
  });

  it('has four suits of thirteen ranks with no 6', () => {
    expect(SUITS).toHaveLength(4);
    expect(RANKS).toHaveLength(13);
    expect(RANKS).not.toContain('6');
    for (const suit of SUITS) {
      expect(DECK.filter((card) => card.kind === 'suit' && card.suit === suit)).toHaveLength(13);
    }
  });

  it('has twenty Money cards worth $400,000 in total', () => {
    const money = DECK.filter(isMoney);
    expect(money).toHaveLength(20);
    expect(sumMoney(money.map((card) => card.id))).toBe(TOTAL_MONEY);
    expect(sumMoney(DECK.map((card) => card.id))).toBe(TOTAL_MONEY);
  });

  it('classifies number cards and Money cards', () => {
    expect(isNumberCard(cardById(c('R11')))).toBe(true);
    expect(isMoney(cardById(c('R11')))).toBe(false);
    expect(isMoney(cardById(c('R5k')))).toBe(true);
    expect(isNumberCard(cardById(c('T')))).toBe(false);
    expect(isMoney(cardById(c('T')))).toBe(false);
    expect(moneyValue(cardById(c('G40k')))).toBe(40_000);
    expect(moneyValue(cardById(c('BU')))).toBe(0);
  });
});

describe('rank order', () => {
  it('ranks $40k > $30k > $15k > 11 > $10k > 9 > 8 > 7 > $5k > 4 > 3 > 2 > 1', () => {
    const order = ['40k', '30k', '15k', '11', '10k', '9', '8', '7', '5k', '4', '3', '2', '1'];
    for (let i = 0; i + 1 < order.length; i++) {
      const high = cardById(c(`R${order[i]}`));
      const low = cardById(c(`R${order[i + 1]}`));
      if (high.kind !== 'suit' || low.kind !== 'suit') throw new Error('unreachable');
      expect(rankIndex(high), `${order[i]} beats ${order[i + 1]}`).toBeGreaterThan(rankIndex(low));
    }
  });

  it('does not rank by money value: the 11 beats the $10k', () => {
    const eleven = cardById(c('Y11'));
    const tenK = cardById(c('Y10k'));
    if (eleven.kind !== 'suit' || tenK.kind !== 'suit') throw new Error('unreachable');
    expect(moneyValue(eleven)).toBeLessThan(moneyValue(tenK));
    expect(rankIndex(eleven)).toBeGreaterThan(rankIndex(tenK));
  });
});

describe('suits and trump', () => {
  it('treats the Tiger as a card of the trump suit', () => {
    expect(effectiveSuit(cardById(TIGER_ID), 'green')).toBe('green');
    expect(isTrump(cardById(TIGER_ID), 'black')).toBe(true);
  });

  it('gives the Bull and Bear no suit', () => {
    expect(effectiveSuit(cardById(BULL_ID), 'red')).toBeNull();
    expect(effectiveSuit(cardById(BEAR_ID), 'red')).toBeNull();
    expect(isTrump(cardById(BULL_ID), 'red')).toBe(false);
  });

  it('labels cards for display', () => {
    expect(cardLabel(cardById(c('R40k')))).toBe('$40k');
    expect(cardLabel(cardById(c('B11')))).toBe('11');
    expect(cardLabel(cardById(TIGER_ID))).toBe('Tiger');
  });
});
