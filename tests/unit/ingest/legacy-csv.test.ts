import { describe, expect, it } from 'vitest';
import { readLegacyExport, resolverFrom } from '../../../src/ingest/legacy-csv.js';
import {
  parseMediaSerial,
  parsePrintedId,
  type MediaSerial,
  type PrintedId,
} from '../../../src/util/ids.js';
import { expect as expectOk, isErr } from '../../../src/util/result.js';

const printed = (raw: string): PrintedId => expectOk(parsePrintedId(raw), 'printed');
const serial = (raw: string): MediaSerial => expectOk(parseMediaSerial(raw), 'serial');

const CARD_A = printed('4021-8830-1174');
const CARD_B = printed('4021-8830-9902');
const SERIAL_A = serial('E2004A1B00000123');
const SERIAL_A2 = serial('E2004A1B00000ABC');
const SERIAL_B = serial('E2004A1B00000456');

const resolve = resolverFrom([
  {
    printed: CARD_A,
    serial: SERIAL_A,
    from: new Date('2024-12-01T00:00:00Z'),
    until: new Date('2025-01-13T18:00:00Z'),
  },
  { printed: CARD_A, serial: SERIAL_A2, from: new Date('2025-01-13T18:00:00Z') },
  { printed: CARD_B, serial: SERIAL_B, from: new Date('2024-12-01T00:00:00Z') },
]);

const header = 'GATE;CARDNO;STAMP;CNT;RES;DBM';
const body = [
  'BOWL.01;4021-8830-1174;2025-01-13 16:14:07;9001;OK;-52',
  'BOWL.01;4021-8830-9902;2025-01-13 16:15:41;9002;NOK;-61',
].join('\n');

describe('reading the 2019 export', () => {
  it('turns the rows into ordinary scans', () => {
    const read = expectOk(readLegacyExport(`${header}\n${body}`, { resolve }), 'legacy');
    expect(read.scans).toHaveLength(2);
    expect(read.scans[0]).toMatchObject({
      terminalId: 'BOWL.01',
      mediaSerial: SERIAL_A,
      sequence: 9001,
      outcome: 'accept',
      rssi: -52,
    });
    expect(read.scans[1]?.gateReason).toBe('nok');
  });

  it('reads the bare stamp as the terminal clock', () => {
    const read = expectOk(readLegacyExport(`${header}\n${body}`, { resolve }), 'legacy');
    expect(read.scans[0]?.reportedAt.toISOString()).toBe('2025-01-13T16:14:07.000Z');
  });

  it('resolves a reissued card by the moment of the scan', () => {
    const late = 'BOWL.01;4021-8830-1174;2025-01-13 19:00:00;9003;OK;-52';
    const read = expectOk(readLegacyExport(`${header}\n${late}`, { resolve }), 'legacy');
    expect(read.scans[0]?.mediaSerial).toBe(SERIAL_A2);
  });

  it('takes every result code the controllers emit', () => {
    const rows = ['PASS', 'DENY', 'BLOCK'].map(
      (code, i) => `BOWL.01;4021-8830-9902;2025-01-13 16:1${i}:00;${9100 + i};${code};-52`,
    );
    const read = expectOk(readLegacyExport([header, ...rows].join('\n'), { resolve }), 'legacy');
    expect(read.scans.map((scan) => scan.outcome)).toEqual(['accept', 'reject', 'reject']);
  });

  it('takes a comma separated variant when asked', () => {
    const commas = `${header.replace(/;/g, ',')}\n${body.split('\n')[0]!.replace(/;/g, ',')}`;
    const read = expectOk(readLegacyExport(commas, { resolve, delimiter: ',' }), 'legacy');
    expect(read.scans).toHaveLength(1);
  });

  it('refuses an export with a column missing', () => {
    const short = readLegacyExport(
      'GATE;CARDNO;STAMP\nBOWL.01;4021-8830-1174;2025-01-13 16:14:07',
      { resolve },
    );
    expect(short.ok).toBe(false);
    expect(!short.ok && short.error).toContain('CNT');
  });

  it('refuses a file that is not readable as a table', () => {
    expect(isErr(readLegacyExport('', { resolve }))).toBe(true);
  });

  it('drops a row whose card is not a printed number', () => {
    const bad = `${header}\nBOWL.01;402188301174;2025-01-13 16:14:07;9001;OK;-52`;
    const read = expectOk(readLegacyExport(bad, { resolve }), 'legacy');
    expect(read.scans).toEqual([]);
    expect(read.diagnostics.has('legacy.bad_card')).toBe(true);
    expect(read.diagnostics.has('legacy.partial')).toBe(true);
  });

  it('drops a row whose stamp is unreadable', () => {
    const bad = `${header}\nBOWL.01;4021-8830-1174;13/01/2025 16:14;9001;OK;-52`;
    const read = expectOk(readLegacyExport(bad, { resolve }), 'legacy');
    expect(read.diagnostics.has('legacy.bad_stamp')).toBe(true);
  });

  it('drops a card nobody was holding at the time', () => {
    const bad = `${header}\nBOWL.01;4021-8830-1174;2024-11-01 16:14:07;9001;OK;-52`;
    const read = expectOk(readLegacyExport(bad, { resolve, file: 'bowl.csv' }), 'legacy');
    expect(read.diagnostics.has('legacy.unresolved_card')).toBe(true);
    expect(read.diagnostics.bySeverity('error')[0]?.source).toEqual({ file: 'bowl.csv', line: 2 });
  });

  it('drops a result code nobody has documented', () => {
    const bad = `${header}\nBOWL.01;4021-8830-9902;2025-01-13 16:14:07;9001;MAYBE;-52`;
    const read = expectOk(readLegacyExport(bad, { resolve }), 'legacy');
    expect(read.diagnostics.has('legacy.bad_result')).toBe(true);
  });

  it('drops a row the scan builder still refuses', () => {
    const bad = `${header}\nBOWL;4021-8830-9902;2025-01-13 16:14:07;9001;OK;-52`;
    const read = expectOk(readLegacyExport(bad, { resolve }), 'legacy');
    expect(read.diagnostics.has('legacy.unreadable_row')).toBe(true);
  });
});

describe('the printed number resolver', () => {
  it('answers nothing for a number it has never seen', () => {
    expect(resolve(printed('9999-9999-9999'), new Date('2025-01-13T16:00:00Z'))).toBeUndefined();
  });

  it('answers nothing before the card was issued', () => {
    expect(resolve(CARD_A, new Date('2024-11-01T16:00:00Z'))).toBeUndefined();
  });

  it('takes the interval as half open at the handover', () => {
    expect(resolve(CARD_A, new Date('2025-01-13T17:59:59Z'))).toBe(SERIAL_A);
    expect(resolve(CARD_A, new Date('2025-01-13T18:00:00Z'))).toBe(SERIAL_A2);
  });

  it('runs an open ended binding forever', () => {
    expect(resolve(CARD_B, new Date('2030-01-01T00:00:00Z'))).toBe(SERIAL_B);
  });
});
