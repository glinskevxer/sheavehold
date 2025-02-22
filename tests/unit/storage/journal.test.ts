import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Journal } from '../../../src/storage/journal.js';
import { encodeRecord } from '../../../src/storage/journal-format.js';
import { tempDir, tempPath } from '../../support/tempdir.js';

const AT = new Date('2025-01-13T23:40:00Z');

describe('opening a journal', () => {
  it('creates the file and the directory under it', () => {
    const path = join(tempDir(), 'deep', 'store', 'journal.log');
    const opened = Journal.open(path);
    expect(opened.recovered).toBe(0);
    expect(opened.journal.length).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe('');
  });

  it('reads back what was written', () => {
    const path = tempPath('journal.log');
    const first = Journal.open(path).journal;
    first.append({ kind: 'scan.recorded', body: { seq: 1 }, at: AT });
    first.append({ kind: 'scan.recorded', body: { seq: 2 }, at: AT });

    const second = Journal.open(path);
    expect(second.recovered).toBe(2);
    expect(second.journal.head).toBe(2);
    expect(second.journal.all().map((record) => record.sequence)).toEqual([1, 2]);
  });

  it('carries on numbering where the file left off', () => {
    const path = tempPath('journal.log');
    Journal.open(path).journal.append({ kind: 'a', body: 1, at: AT });
    const second = Journal.open(path).journal;
    expect(second.append({ kind: 'b', body: 2, at: AT }).sequence).toBe(2);
  });
});

describe('a torn tail', () => {
  it('keeps the good records and rewrites the file without the rubbish', () => {
    const path = tempPath('journal.log');
    const journal = Journal.open(path).journal;
    journal.append({ kind: 'a', body: 1, at: AT });
    journal.append({ kind: 'a', body: 2, at: AT });
    appendFileSync(path, '3 deadbeef 40 {"kind":"a","at":"2025', 'utf8');

    const reopened = Journal.open(path);
    expect(reopened.recovered).toBe(2);
    expect(reopened.truncatedAtLine).toBe(3);
    expect(reopened.truncateReason).toBeDefined();
    expect(readFileSync(path, 'utf8').trim().split('\n')).toHaveLength(2);
  });

  it('appends after the truncation without a hole in the sequence', () => {
    const path = tempPath('journal.log');
    const journal = Journal.open(path).journal;
    journal.append({ kind: 'a', body: 1, at: AT });
    appendFileSync(path, 'garbage\n', 'utf8');

    const reopened = Journal.open(path).journal;
    expect(reopened.append({ kind: 'b', body: 2, at: AT }).sequence).toBe(2);
    expect(Journal.open(path).recovered).toBe(2);
  });

  it('empties a file that was rubbish from the first byte', () => {
    const path = tempPath('journal.log');
    writeFileSync(path, 'not a journal at all\n', 'utf8');
    const reopened = Journal.open(path);
    expect(reopened.recovered).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe('');
  });
});

describe('reading a journal', () => {
  function loaded(): Journal {
    const journal = Journal.open(tempPath('journal.log')).journal;
    journal.appendAll([
      { kind: 'scan.recorded', body: 1, at: AT },
      { kind: 'ride.built', body: 2, at: AT },
      { kind: 'scan.recorded', body: 3, at: AT },
    ]);
    return journal;
  }

  it('filters by kind and by sequence', () => {
    const journal = loaded();
    expect(journal.ofKind('scan.recorded')).toHaveLength(2);
    expect(journal.ofKind('nothing')).toEqual([]);
    expect(journal.since(1).map((record) => record.sequence)).toEqual([2, 3]);
    expect(journal.since(9)).toEqual([]);
  });

  it('keeps the timestamp it was given', () => {
    expect(loaded().all()[0]?.at).toBe('2025-01-13T23:40:00.000Z');
  });

  it('stamps now when nobody said', () => {
    const journal = Journal.open(tempPath('journal.log')).journal;
    const before = Date.now();
    const record = journal.append({ kind: 'a', body: 1 });
    expect(new Date(record.at).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('replacing the contents', () => {
  it('rewrites the file and resets the head', () => {
    const path = tempPath('journal.log');
    const journal = Journal.open(path).journal;
    journal.appendAll([
      { kind: 'a', body: 1, at: AT },
      { kind: 'a', body: 2, at: AT },
      { kind: 'a', body: 3, at: AT },
    ]);
    journal.replace([{ sequence: 1, kind: 'snapshot.taken', at: AT.toISOString(), body: {} }]);
    expect(journal.length).toBe(1);
    expect(journal.head).toBe(1);
    expect(Journal.open(path).recovered).toBe(1);
  });

  it('refuses a replacement that is out of order', () => {
    const journal = Journal.open(tempPath('journal.log')).journal;
    const record = { kind: 'a', at: AT.toISOString(), body: {} };
    expect(() =>
      journal.replace([
        { ...record, sequence: 2 },
        { ...record, sequence: 1 },
      ]),
    ).toThrow('not in order');
  });

  it('writes an empty file when replaced with nothing', () => {
    const path = tempPath('journal.log');
    const journal = Journal.open(path).journal;
    journal.append({ kind: 'a', body: 1, at: AT });
    journal.replace([]);
    expect(readFileSync(path, 'utf8')).toBe('');
    expect(journal.head).toBe(0);
    expect(encodeRecord({ sequence: 1, kind: 'a', at: AT.toISOString(), body: {} })).toContain(
      '1 ',
    );
  });
});
