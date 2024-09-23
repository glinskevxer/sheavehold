import { describe, expect, it } from 'vitest';
import {
  escapeCsvField,
  parseCsv,
  parseCsvTable,
  writeCsv,
  writeCsvTable,
} from '../../../src/util/csv.js';
import { expect as expectOk, isErr } from '../../../src/util/result.js';

const rows = (text: string) => expectOk(parseCsv(text), 'csv').map((row) => row.fields);

describe('reading comma separated gate exports', () => {
  it('reads plain rows', () => {
    expect(rows('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles carriage returns from the older controllers', () => {
    expect(rows('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips a byte order mark', () => {
    expect(rows('﻿terminal,scanned_at\nSUNB.01,9')).toEqual([
      ['terminal', 'scanned_at'],
      ['SUNB.01', '9'],
    ]);
  });

  it('keeps a comma inside a quoted field', () => {
    expect(rows('name,note\nSUNB.01,"windy, held at 10:04"')).toEqual([
      ['name', 'note'],
      ['SUNB.01', 'windy, held at 10:04'],
    ]);
  });

  it('unescapes a doubled quote', () => {
    expect(rows('note\n"he said ""pass back"" and walked off"')).toEqual([
      ['note'],
      ['he said "pass back" and walked off'],
    ]);
  });

  it('keeps a newline inside a quoted field and still counts lines', () => {
    const parsed = expectOk(parseCsv('a\n"one\ntwo"\nb'), 'csv');
    expect(parsed.map((row) => row.fields)).toEqual([['a'], ['one\ntwo'], ['b']]);
  });

  it('drops the trailing blank line the 2019 units leave', () => {
    expect(rows('a,b\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps blank rows when asked to', () => {
    const parsed = expectOk(parseCsv('a\n\nb', { skipBlankRows: false }), 'csv');
    expect(parsed.map((row) => row.fields)).toEqual([['a'], [''], ['b']]);
  });

  it('takes a semicolon delimiter', () => {
    const parsed = expectOk(parseCsv('a;b\n1;2', { delimiter: ';' }), 'csv');
    expect(parsed.map((row) => row.fields)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('refuses a file that ends inside a quoted field', () => {
    expect(isErr(parseCsv('a\n"unterminated'))).toBe(true);
  });

  it('refuses a quote that opens part way through a field', () => {
    expect(isErr(parseCsv('a\nab"cd"'))).toBe(true);
  });

  it('refuses a delimiter that is not a single character', () => {
    expect(isErr(parseCsv('a,b', { delimiter: '||' }))).toBe(true);
  });
});

describe('reading with a header', () => {
  it('names the fields and remembers the source line', () => {
    const table = expectOk(parseCsvTable('lift,rise\nSUNB,1240\nRIDGE,880'), 'table');
    expect(table.header).toEqual(['lift', 'rise']);
    expect(table.records[0]).toEqual({ line: 2, values: { lift: 'SUNB', rise: '1240' } });
    expect(table.records[1]?.values.rise).toBe('880');
  });

  it('trims the header names but not the values', () => {
    const table = expectOk(parseCsvTable('lift , rise\n SUNB ,1240'), 'table');
    expect(table.header).toEqual(['lift', 'rise']);
    expect(table.records[0]?.values.lift).toBe(' SUNB ');
  });

  it('refuses a short row rather than filling it in', () => {
    expect(isErr(parseCsvTable('lift,rise\nSUNB'))).toBe(true);
  });

  it('refuses a duplicated or empty column name', () => {
    expect(isErr(parseCsvTable('lift,lift\n1,2'))).toBe(true);
    expect(isErr(parseCsvTable('lift,\n1,2'))).toBe(true);
  });

  it('refuses an empty file', () => {
    expect(isErr(parseCsvTable(''))).toBe(true);
  });
});

describe('writing', () => {
  it('quotes only what has to be quoted', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('with,comma')).toBe('"with,comma"');
    expect(escapeCsvField('with"quote')).toBe('"with""quote"');
    expect(escapeCsvField(' padded ')).toBe('" padded "');
  });

  it('round trips through the reader', () => {
    const original = [
      ['lift', 'note'],
      ['SUNB', 'held, wind'],
      ['RIDGE', 'said "ok"'],
    ];
    expect(rows(writeCsv(original))).toEqual(original);
  });

  it('writes records in header order and fills a missing key', () => {
    const text = writeCsvTable(
      ['lift', 'rise'],
      [{ lift: 'SUNB', rise: '1240' }, { lift: 'RIDGE' }],
    );
    expect(text).toBe('lift,rise\nSUNB,1240\nRIDGE,');
  });
});
