import { describe, expect, it } from 'vitest';
import { readUploadFile, writeUploadFile } from '../../../src/ingest/ndjson.js';
import { checksumOf, makeEnvelope, type UploadEnvelope } from '../../../src/ingest/envelope.js';
import type { RawScan } from '../../../src/domain/scan/scan.js';
import { expect as expectOk, isErr } from '../../../src/util/result.js';
import { rawScan } from '../../support/scans.js';

const scans: RawScan[] = [
  rawScan({ seq: 1, at: '2025-01-13T16:14:07Z' }),
  rawScan({ seq: 2, at: '2025-01-13T16:14:19Z', media: 'E2004A1B00000456' }),
];

const envelope: UploadEnvelope = expectOk(
  makeEnvelope({
    batch: 'up-441',
    terminal: 'SUNB.01',
    uploaded: '2025-01-13T23:40:00Z',
    first: 1,
    last: 2,
    rows: 2,
    checksum: checksumOf(scans),
    firmware: '4.11.2',
  }),
  'envelope',
);

const file = writeUploadFile(envelope, scans);

describe('reading an upload', () => {
  it('round trips through the writer', () => {
    const read = expectOk(readUploadFile(file), 'upload');
    expect(read.envelope).toEqual(envelope);
    expect(read.scans).toHaveLength(2);
    expect(read.scans[1]?.mediaSerial).toBe('E2004A1B00000456');
    expect(read.diagnostics.length).toBe(0);
  });

  it('skips blank lines, comments and a byte order mark', () => {
    const messy = `\ufeff# written by gate 4.11.2\n${file.split('\n')[0]}\n\n${file.split('\n').slice(1).join('\n')}\n`;
    const read = expectOk(readUploadFile(messy), 'upload');
    expect(read.scans).toHaveLength(2);
  });

  it('takes carriage returns from the old link layer', () => {
    const read = expectOk(readUploadFile(file.split('\n').join('\r\n')), 'upload');
    expect(read.scans).toHaveLength(2);
  });

  it('refuses a file with nothing in it', () => {
    expect(isErr(readUploadFile(''))).toBe(true);
    expect(isErr(readUploadFile('\n\n# only a comment\n'))).toBe(true);
  });

  it('refuses a file whose envelope line is not json', () => {
    expect(isErr(readUploadFile('not json\n'))).toBe(true);
  });

  it('refuses a file whose envelope is missing a field', () => {
    const bad = readUploadFile('{"batch":"up-1"}\n');
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error).toContain('missing');
  });

  it('refuses a file whose envelope will not build', () => {
    const lines = file.split('\n');
    const head = JSON.parse(lines[0]!) as Record<string, unknown>;
    head['terminal'] = 'SUNB';
    expect(isErr(readUploadFile([JSON.stringify(head), ...lines.slice(1)].join('\n')))).toBe(true);
  });

  it('drops a row that is not json and keeps the rest', () => {
    const lines = file.split('\n');
    const read = expectOk(
      readUploadFile([lines[0]!, 'garbage', lines[1]!, lines[2]!].join('\n')),
      'upload',
    );
    expect(read.scans).toHaveLength(2);
    expect(read.diagnostics.has('row.not_json')).toBe(true);
    expect(read.diagnostics.has('batch.partial')).toBe(true);
  });

  it('drops a row the schema refuses and points at the line', () => {
    const lines = file.split('\n');
    const read = expectOk(
      readUploadFile([lines[0]!, '{"terminal":"SUNB.01"}', lines[1]!].join('\n'), {
        file: 'gate.ndjson',
      }),
      'upload',
    );
    expect(read.scans).toHaveLength(1);
    const entry = read.diagnostics.bySeverity('error')[0];
    expect(entry?.code).toBe('row.unreadable');
    expect(entry?.source).toEqual({ batch: 'up-441', file: 'gate.ndjson', line: 2 });
  });

  it('stops after the error budget runs out', () => {
    const lines = [file.split('\n')[0]!, 'a', 'b', 'c', 'd'];
    const read = expectOk(readUploadFile(lines.join('\n'), { maxErrors: 2 }), 'upload');
    expect(read.diagnostics.bySeverity('error')).toHaveLength(2);
  });

  it('reads a batch with no rows at all', () => {
    const read = expectOk(readUploadFile(file.split('\n')[0]!), 'upload');
    expect(read.scans).toEqual([]);
    expect(read.diagnostics.length).toBe(0);
  });
});

describe('writing an upload', () => {
  it('puts the envelope first and one row per line', () => {
    const lines = file.split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]!)).toMatchObject({ batch: 'up-441', rows: 2 });
    expect(JSON.parse(lines[1]!)).toMatchObject({ seq: 1, outcome: 'accept' });
  });

  it('writes the reported time, not a corrected one', () => {
    expect(JSON.parse(file.split('\n')[1]!)).toMatchObject({ at: '2025-01-13T16:14:07.000Z' });
  });
});
