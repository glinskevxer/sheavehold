import { describe, expect, it } from 'vitest';
import {
  distinct,
  distinctSorted,
  groupBy,
  maxBy,
  partitionBy,
  sumBy,
  tallyBy,
} from '../../../src/util/collect.js';

interface Row {
  lift: string;
  rides: number;
}

const rows: Row[] = [
  { lift: 'SUNB', rides: 3 },
  { lift: 'MEADW', rides: 2 },
  { lift: 'SUNB', rides: 4 },
];

describe('grouping', () => {
  it('keeps the input order inside each group', () => {
    const grouped = groupBy(rows, (row) => row.lift);
    expect([...grouped.keys()]).toEqual(['SUNB', 'MEADW']);
    expect(grouped.get('SUNB')?.map((row) => row.rides)).toEqual([3, 4]);
  });

  it('gives an empty map for nothing', () => {
    expect(groupBy([], (row: Row) => row.lift).size).toBe(0);
  });
});

describe('tallying', () => {
  it('counts by key', () => {
    expect([...tallyBy(rows, (row) => row.lift)]).toEqual([
      ['SUNB', 2],
      ['MEADW', 1],
    ]);
  });

  it('skips a row whose key is nothing', () => {
    expect([...tallyBy(rows, (row) => (row.lift === 'SUNB' ? row.lift : undefined))]).toEqual([
      ['SUNB', 2],
    ]);
  });
});

describe('distinct values', () => {
  it('keeps first appearance order', () => {
    expect(distinct(rows, (row) => row.lift)).toEqual(['SUNB', 'MEADW']);
  });

  it('sorts when asked', () => {
    expect(distinctSorted(rows, (row) => row.lift)).toEqual(['MEADW', 'SUNB']);
  });

  it('gives nothing for nothing', () => {
    expect(distinct([], (row: Row) => row.lift)).toEqual([]);
  });
});

describe('summing', () => {
  it('adds a field up', () => {
    expect(sumBy(rows, (row) => row.rides)).toBe(9);
  });

  it('adds nothing to nothing', () => {
    expect(sumBy([], (row: Row) => row.rides)).toBe(0);
  });
});

describe('the maximum', () => {
  it('finds the biggest and keeps the first on a tie', () => {
    expect(maxBy(rows, (row) => row.rides)).toEqual({ lift: 'SUNB', rides: 4 });
    expect(maxBy([rows[0]!, { lift: 'BOWL', rides: 3 }], (row) => row.rides)?.lift).toBe('SUNB');
  });

  it('answers nothing for an empty list', () => {
    expect(maxBy([], (row: Row) => row.rides)).toBeUndefined();
  });
});

describe('partitioning', () => {
  it('splits on a predicate and keeps both orders', () => {
    expect(partitionBy(rows, (row) => row.lift === 'SUNB')).toEqual({
      matched: [rows[0], rows[2]],
      rest: [rows[1]],
    });
  });

  it('gives two empty lists for nothing', () => {
    expect(partitionBy([], () => true)).toEqual({ matched: [], rest: [] });
  });
});
