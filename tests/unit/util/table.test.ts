import { describe, expect, it } from 'vitest';
import {
  indent,
  padTo,
  renderHeading,
  renderPairs,
  renderTable,
  truncate,
  type Column,
} from '../../../src/util/table.js';

interface LiftRow {
  code: string;
  rides: number;
  note: string;
}

const sample: LiftRow[] = [
  { code: 'SUNB', rides: 4120, note: 'ran all day' },
  { code: 'RIDGE', rides: 812, note: 'held for wind from 10:04 until 11:20' },
  { code: 'BOWL', rides: 0, note: '' },
];

const columns: Column<LiftRow>[] = [
  { header: 'lift', value: (row) => row.code },
  { header: 'rides', align: 'right', value: (row) => String(row.rides) },
  { header: 'note', maxWidth: 20, value: (row) => row.note },
];

describe('the text table', () => {
  it('sizes every column to its widest cell', () => {
    const lines = renderTable(sample, columns);
    expect(lines[0]).toBe('lift   rides  note');
    expect(lines[1]).toBe('-----  -----  --------------------');
    expect(lines[2]).toBe('SUNB    4120  ran all day');
  });

  it('right aligns the numbers', () => {
    const lines = renderTable(sample, columns);
    expect(lines[4]).toBe('BOWL       0');
  });

  it('cuts a cell at the column cap and marks it', () => {
    const lines = renderTable(sample, columns);
    expect(lines[3]).toBe('RIDGE    812  held for wind fro...');
  });

  it('trims the trailing padding so nothing has invisible width', () => {
    const lines = renderTable(sample, columns);
    for (const line of lines) expect(line).toBe(line.trimEnd());
  });

  it('leaves the rule out when asked', () => {
    const lines = renderTable(sample, columns, { rule: '' });
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('SUNB    4120  ran all day');
  });

  it('takes a different gap', () => {
    const lines = renderTable(sample.slice(0, 1), columns, { gap: ' | ', rule: '' });
    expect(lines[1]).toBe('SUNB |  4120 | ran all day');
  });

  it('renders a header and a rule even with no rows', () => {
    const lines = renderTable([], columns);
    expect(lines).toEqual(['lift  rides  note', '----  -----  ----']);
  });

  it('gives nothing back with no columns', () => {
    expect(renderTable(sample, [])).toEqual([]);
  });

  it('caps the whole line at the printer width', () => {
    const wide: Column<LiftRow>[] = [{ header: 'note', value: (row) => row.note.padEnd(200, '.') }];
    const lines = renderTable(sample.slice(0, 1), wide, { totalWidth: 30 });
    expect(lines[2]).toHaveLength(30);
    expect(lines[2]?.endsWith('...')).toBe(true);
  });
});

describe('the small helpers', () => {
  it('truncates only when it has to', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('a longer string', 8)).toBe('a lon...');
    expect(truncate('abcdef', 3)).toBe('abc');
    expect(truncate('abcdef', 0)).toBe('');
  });

  it('pads on the side the alignment asks for', () => {
    expect(padTo('ab', 5, 'left')).toBe('ab   ');
    expect(padTo('ab', 5, 'right')).toBe('   ab');
    expect(padTo('abcdef', 3, 'left')).toBe('abcdef');
  });

  it('lines the labels up in a pair block', () => {
    expect(
      renderPairs([
        ['skier visits', '4,120'],
        ['lifts running', '7'],
      ]),
    ).toEqual(['skier visits   4,120', 'lifts running  7']);
  });

  it('centres a heading over a rule', () => {
    const [title, rule] = renderHeading('daily operations', 20);
    expect(title).toBe('  daily operations');
    expect(rule).toBe('='.repeat(20));
  });

  it('indents everything except the blank lines', () => {
    expect(indent(['a', '', 'b'], 3)).toEqual(['   a', '', '   b']);
  });
});
