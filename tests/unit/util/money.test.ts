import { describe, expect, it } from 'vitest';
import {
  addMoney,
  apportion,
  cents,
  compareMoney,
  formatMoney,
  negateMoney,
  parseMoney,
  scaleMoney,
  splitEvenly,
  subtractMoney,
  sumMoney,
} from '../../../src/util/money.js';
import { expect as expectOk, isErr } from '../../../src/util/result.js';

const money = (raw: string) => expectOk(parseMoney(raw), 'money');

describe('money', () => {
  it('reads the shapes the point of sale export uses', () => {
    expect(money('$129.00')).toBe(12900);
    expect(money('129')).toBe(12900);
    expect(money('1,249.50')).toBe(124950);
    expect(money('  $0.07 ')).toBe(7);
    expect(money('-$12.34')).toBe(-1234);
  });

  it('refuses anything that is not a money value', () => {
    expect(isErr(parseMoney('twelve'))).toBe(true);
    expect(isErr(parseMoney('12.345'))).toBe(true);
    expect(isErr(parseMoney(''))).toBe(true);
  });

  it('prints with grouping and always two places', () => {
    expect(formatMoney(cents(12900))).toBe('$129.00');
    expect(formatMoney(cents(7))).toBe('$0.07');
    expect(formatMoney(cents(124950))).toBe('$1,249.50');
    expect(formatMoney(cents(-1234))).toBe('-$12.34');
    expect(formatMoney(cents(0))).toBe('$0.00');
  });

  it('round trips through parse and format', () => {
    for (const raw of ['$0.00', '$1.05', '$99.99', '$10,000.00', '-$5.50']) {
      expect(formatMoney(money(raw))).toBe(raw);
    }
  });

  it('adds, subtracts and negates whole cents', () => {
    expect(addMoney(cents(100), cents(250), cents(1))).toBe(351);
    expect(subtractMoney(cents(500), cents(125))).toBe(375);
    expect(negateMoney(cents(500))).toBe(-500);
    expect(sumMoney([cents(1), cents(2), cents(3)])).toBe(6);
  });

  it('refuses a fractional cent at construction', () => {
    expect(() => cents(10.5)).toThrow('not a whole number of cents');
  });

  it('scales half away from zero', () => {
    expect(scaleMoney(cents(1000), 0.075)).toBe(75);
    expect(scaleMoney(cents(101), 0.5)).toBe(51);
    expect(scaleMoney(cents(-101), 0.5)).toBe(-51);
  });

  it('apportions exactly and never loses a cent', () => {
    const parts = apportion(cents(10000), [1, 1, 1]);
    expect(parts).toEqual([3334, 3333, 3333]);
    expect(sumMoney(parts)).toBe(10000);
  });

  it('apportions by weight rather than evenly when asked', () => {
    const parts = apportion(cents(12900), [3, 1, 1]);
    expect(sumMoney(parts)).toBe(12900);
    expect(parts[0]).toBeGreaterThan(parts[1]!);
    expect(parts[1]).toBe(parts[2]);
  });

  it('breaks a tie toward the earlier day on the ticket', () => {
    expect(apportion(cents(100), [1, 1, 1, 1, 1, 1, 1])).toEqual([15, 15, 14, 14, 14, 14, 14]);
  });

  it('gives every part nothing when all the weights are zero', () => {
    expect(apportion(cents(500), [0, 0])).toEqual([0, 0]);
  });

  it('apportions a negative total back to the same magnitude', () => {
    const parts = apportion(cents(-10000), [1, 1, 1]);
    expect(sumMoney(parts)).toBe(-10000);
  });

  it('splits evenly as a special case of apportion', () => {
    expect(splitEvenly(cents(1000), 4)).toEqual([250, 250, 250, 250]);
    expect(splitEvenly(cents(10), 3)).toEqual([4, 3, 3]);
    expect(splitEvenly(cents(1000), 0)).toEqual([]);
  });

  it('refuses a negative weight', () => {
    expect(() => apportion(cents(100), [1, -1])).toThrow('negative weight');
  });

  it('orders amounts', () => {
    const sorted = [cents(500), cents(100), cents(300)].sort(compareMoney);
    expect(sorted).toEqual([100, 300, 500]);
  });
});
