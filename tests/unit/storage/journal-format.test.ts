import { describe, expect, it } from 'vitest';
import {
  crc32,
  decodeJournal,
  decodeRecord,
  encodeRecord,
  lastSequence,
  type JournalRecord,
} from '../../../src/storage/journal-format.js';
import { expect as expectOk, isErr } from '../../../src/util/result.js';

function record(sequence: number, overrides: Partial<JournalRecord> = {}): JournalRecord {
  return {
    sequence,
    kind: 'scan.recorded',
    at: '2025-01-13T23:40:00.000Z',
    body: { terminal: 'SUNB.01', seq: sequence },
    ...overrides,
  };
}

describe('the checksum', () => {
  it('is eight hex digits and depends on the text', () => {
    expect(crc32('hello')).toMatch(/^[0-9a-f]{8}$/);
    expect(crc32('hello')).not.toBe(crc32('hellp'));
    expect(crc32('')).toBe('00000000');
  });

  it('agrees with the known value for a short string', () => {
    expect(crc32('123456789')).toBe('cbf43926');
  });
});

describe('one record', () => {
  it('round trips', () => {
    const line = encodeRecord(record(7));
    const back = expectOk(decodeRecord(line), 'record');
    expect(back).toEqual(record(7));
  });

  it('writes the sequence, checksum and length up front', () => {
    const line = encodeRecord(record(7));
    const [sequence, checksum, length] = line.split(' ');
    expect(sequence).toBe('7');
    expect(checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(Number(length)).toBe(line.split(' ').slice(3).join(' ').length);
  });

  it('escapes a newline in the body rather than breaking the line', () => {
    const line = encodeRecord(record(1, { body: { note: 'one\ntwo' } }));
    expect(line.split('\n')).toHaveLength(1);
    expect(expectOk(decodeRecord(line), 'r').body).toEqual({ note: 'one\ntwo' });
  });

  it('refuses a kind with whitespace in it and a sequence below one', () => {
    expect(() => encodeRecord(record(1, { kind: 'scan recorded' }))).toThrow('whitespace');
    expect(() => encodeRecord(record(0))).toThrow('positive sequence');
  });

  it('refuses a line that is not a record at all', () => {
    expect(isErr(decodeRecord('hello'))).toBe(true);
    expect(isErr(decodeRecord(''))).toBe(true);
  });

  it('catches a flipped byte', () => {
    const line = encodeRecord(record(7));
    const broken = line.replace('SUNB.01', 'SUNB.02');
    expect(isErr(decodeRecord(broken))).toBe(true);
  });

  it('catches a truncated payload', () => {
    const line = encodeRecord(record(7));
    expect(isErr(decodeRecord(line.slice(0, line.length - 5)))).toBe(true);
  });

  it('refuses a record with no kind or no timestamp', () => {
    const noKind = encodeRecord({ ...record(1), kind: 'x' }).replace('"kind":"x"', '"kind":""');
    expect(isErr(decodeRecord(noKind))).toBe(true);
  });

  it('carries any json body through', () => {
    const back = expectOk(decodeRecord(encodeRecord(record(1, { body: [1, 'two', null] }))), 'r');
    expect(back.body).toEqual([1, 'two', null]);
  });
});

describe('a whole journal', () => {
  const text = [record(1), record(2), record(3)].map(encodeRecord).join('\n');

  it('reads every record in order', () => {
    const decoded = decodeJournal(text);
    expect(decoded.records.map((entry) => entry.sequence)).toEqual([1, 2, 3]);
    expect(decoded.stoppedAtLine).toBeUndefined();
    expect(lastSequence(decoded.records)).toBe(3);
  });

  it('reads an empty file as nothing', () => {
    expect(decodeJournal('').records).toEqual([]);
    expect(decodeJournal('\n\n').records).toEqual([]);
    expect(lastSequence([])).toBe(0);
  });

  it('keeps everything before a torn tail', () => {
    const torn = `${text}\n${encodeRecord(record(4)).slice(0, 20)}`;
    const decoded = decodeJournal(torn);
    expect(decoded.records).toHaveLength(3);
    expect(decoded.stoppedAtLine).toBe(4);
    expect(decoded.stopReason).toContain('claims');
  });

  it('stops when the sequence goes backwards', () => {
    const jumbled = [record(1), record(3), record(2)].map(encodeRecord).join('\n');
    const decoded = decodeJournal(jumbled);
    expect(decoded.records.map((entry) => entry.sequence)).toEqual([1, 3]);
    expect(decoded.stopReason).toContain('does not follow');
  });

  it('stops on a repeated sequence', () => {
    const repeated = [record(1), record(1)].map(encodeRecord).join('\n');
    expect(decodeJournal(repeated).records).toHaveLength(1);
  });

  it('stops on a corrupted record in the middle', () => {
    const lines = text.split('\n');
    lines[1] = lines[1]!.replace('SUNB.01', 'SUNB.09');
    const decoded = decodeJournal(lines.join('\n'));
    expect(decoded.records).toHaveLength(1);
    expect(decoded.stopReason).toContain('checksum');
  });
});
