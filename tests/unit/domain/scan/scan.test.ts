import { describe, expect, it } from 'vitest';
import {
  isWeakRead,
  makeRawScan,
  parseReportedAt,
  rawScanSchema,
  readRawScan,
  scanKey,
  WEAK_RSSI_DBM,
  type RawScanRow,
} from '../../../../src/domain/scan/scan.js';
import { expect as expectOk, isErr } from '../../../../src/util/result.js';

const row: RawScanRow = {
  terminal: 'SUNB.01',
  media: 'E2004A1B00000123',
  at: '2025-01-13T16:14:07Z',
  seq: 4021,
  outcome: 'accept',
  reason: '',
  rssi: -52,
  antenna: 1,
};

describe('reading a terminal timestamp', () => {
  it('takes a stamp with a zone at its word', () => {
    expect(expectOk(parseReportedAt('2025-01-13T16:14:07Z'), 'at').toISOString()).toBe(
      '2025-01-13T16:14:07.000Z',
    );
    expect(expectOk(parseReportedAt('2025-01-13T09:14:07-07:00'), 'at').toISOString()).toBe(
      '2025-01-13T16:14:07.000Z',
    );
  });

  it('reads a bare stamp from the old firmware as the terminal clock', () => {
    expect(expectOk(parseReportedAt('2025-01-13 16:14:07'), 'at').toISOString()).toBe(
      '2025-01-13T16:14:07.000Z',
    );
  });

  it('keeps milliseconds when the gate sent them', () => {
    expect(expectOk(parseReportedAt('2025-01-13T16:14:07.250Z'), 'at').toISOString()).toBe(
      '2025-01-13T16:14:07.250Z',
    );
  });

  it('refuses anything else', () => {
    expect(isErr(parseReportedAt('13/01/2025 16:14'))).toBe(true);
    expect(isErr(parseReportedAt('yesterday'))).toBe(true);
    expect(isErr(parseReportedAt('2025-01-13'))).toBe(true);
    expect(isErr(parseReportedAt('2025-13-45T99:99:99Z'))).toBe(true);
  });
});

describe('building a raw scan', () => {
  it('reads a well formed row', () => {
    const scan = expectOk(makeRawScan(row), 'scan');
    expect(scan.terminalId).toBe('SUNB.01');
    expect(scan.mediaSerial).toBe('E2004A1B00000123');
    expect(scan.sequence).toBe(4021);
    expect(scanKey(scan)).toBe('SUNB.01#4021');
  });

  it('trims the gate reason and folds the identifiers', () => {
    const scan = expectOk(
      makeRawScan({
        ...row,
        media: 'e2004a1b00000123',
        terminal: 'sunb.01',
        reason: '  no read  ',
      }),
      'scan',
    );
    expect(scan.gateReason).toBe('no read');
    expect(scan.terminalId).toBe('SUNB.01');
  });

  it('refuses a bad terminal, serial or timestamp', () => {
    expect(isErr(makeRawScan({ ...row, terminal: 'SUNB' }))).toBe(true);
    expect(isErr(makeRawScan({ ...row, media: 'zzz' }))).toBe(true);
    expect(isErr(makeRawScan({ ...row, at: 'nope' }))).toBe(true);
  });

  it('refuses an rssi outside what a reader can see', () => {
    expect(isErr(makeRawScan({ ...row, rssi: 5 }))).toBe(true);
    expect(isErr(makeRawScan({ ...row, rssi: -140 }))).toBe(true);
    expect(expectOk(makeRawScan({ ...row, rssi: -100 }), 'scan').rssi).toBe(-100);
  });

  it('marks a read at the edge of the field', () => {
    expect(isWeakRead(expectOk(makeRawScan(row), 'scan'))).toBe(false);
    expect(isWeakRead(expectOk(makeRawScan({ ...row, rssi: WEAK_RSSI_DBM - 1 }), 'scan'))).toBe(
      true,
    );
    expect(isWeakRead(expectOk(makeRawScan({ ...row, rssi: WEAK_RSSI_DBM }), 'scan'))).toBe(false);
  });
});

describe('reading from json', () => {
  it('defaults a missing reason', () => {
    const { reason, ...withoutReason } = row;
    expect(reason).toBe('');
    expect(expectOk(readRawScan(withoutReason), 'scan').gateReason).toBe('');
  });

  it('names the field that is wrong', () => {
    const bad = readRawScan({ ...row, antenna: 4 });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error.startsWith('antenna:')).toBe(true);
  });

  it('refuses a row that is not an object at all', () => {
    expect(isErr(readRawScan('SUNB.01,4021'))).toBe(true);
    expect(isErr(readRawScan(null))).toBe(true);
  });

  it('refuses a negative or fractional sequence', () => {
    expect(isErr(readRawScan({ ...row, seq: -1 }))).toBe(true);
    expect(isErr(readRawScan({ ...row, seq: 1.5 }))).toBe(true);
  });

  it('still validates the identifiers after the schema passes', () => {
    expect(isErr(readRawScan({ ...row, terminal: 'x' }))).toBe(true);
  });

  it('exposes the schema so the api can reuse it', () => {
    expect(rawScanSchema.safeParse(row).success).toBe(true);
  });
});
