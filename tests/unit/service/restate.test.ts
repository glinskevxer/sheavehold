import { describe, expect, it } from 'vitest';
import {
  dirtyDatesOf,
  restateDate,
  restateScans,
  restateStore,
} from '../../../src/service/restate.js';
import { ClockBook } from '../../../src/domain/scan/clock-skew.js';
import { ScanStore } from '../../../src/storage/repository/scans.js';
import { ingestUpload } from '../../../src/service/ingest.js';
import { expect as expectOk } from '../../../src/util/result.js';
import { handshake } from '../../support/scans.js';
import { ingestContext, uploadFile } from '../../support/uploads.js';
import { day } from '../../support/season.js';

/** Sunburst gate one turns out to have been nearly four hours fast. */
function correctedClocks(): ClockBook {
  return ClockBook.from([
    handshake('SUNB.01', '2025-01-13T11:00:00Z', '2025-01-13T14:50:00Z'),
    handshake('MEADW.01', '2025-01-13T11:00:00Z', '2025-01-13T11:00:00Z'),
  ]);
}

function stored(specs: readonly { at: string; seq: number; terminal?: string }[]) {
  const context = ingestContext();
  expectOk(ingestUpload(uploadFile(specs), context), 'ingest');
  return context.scans;
}

describe('restating with the clock model that is on file now', () => {
  it('leaves everything alone when nothing changed', () => {
    const store = stored([{ at: '2025-01-13T17:00:00Z', seq: 1 }]);
    const result = restateStore(store, ingestContext().clocks);
    expect(result.moves).toEqual([]);
    expect(result.dirtyDates).toEqual([]);
    expect(result.scans[0]?.operatingDate).toBe('2025-01-13');
  });

  it('shifts the corrected time when the handshakes have moved', () => {
    const store = stored([{ at: '2025-01-13T17:00:00Z', seq: 1 }]);
    const result = restateStore(store, correctedClocks());
    expect(result.scans[0]?.at.toISOString()).toBe('2025-01-13T13:10:00.000Z');
    expect(result.scans[0]?.correctionMs).toBe(-13_800_000);
  });

  it('reports a scan that moved to another operating day', () => {
    const store = stored([{ at: '2025-01-14T13:00:00Z', seq: 1 }]);
    const result = restateStore(store, correctedClocks());
    expect(result.moves).toHaveLength(1);
    expect(result.moves[0]).toMatchObject({ from: '2025-01-14', to: '2025-01-13' });
    expect(result.diagnostics.has('restate.day_moved')).toBe(true);
  });

  it('marks both days dirty when one moves', () => {
    const store = stored([{ at: '2025-01-14T13:00:00Z', seq: 1 }]);
    expect(restateStore(store, correctedClocks()).dirtyDates).toEqual(['2025-01-13', '2025-01-14']);
  });

  it('writes the moved scan back into the store under the new day', () => {
    const store = stored([{ at: '2025-01-14T13:00:00Z', seq: 1 }]);
    restateStore(store, correctedClocks());
    expect(store.onDate(day('2025-01-14'))).toEqual([]);
    expect(store.onDate(day('2025-01-13'))).toHaveLength(1);
  });

  it('leaves the store alone when no store was given', () => {
    const store = stored([{ at: '2025-01-14T13:00:00Z', seq: 1 }]);
    restateScans(store.scans.all(), correctedClocks());
    expect(store.onDate(day('2025-01-14'))).toHaveLength(1);
  });

  it('keeps the reported time exactly as the gate sent it', () => {
    const store = stored([{ at: '2025-01-13T17:00:00Z', seq: 1 }]);
    const result = restateStore(store, correctedClocks());
    expect(result.scans[0]?.reportedAt.toISOString()).toBe('2025-01-13T17:00:00.000Z');
  });

  it('restates one day without touching the others', () => {
    const store = stored([
      { at: '2025-01-13T17:00:00Z', seq: 1 },
      { at: '2025-01-14T13:00:00Z', seq: 2 },
    ]);
    const result = restateDate(store, correctedClocks(), day('2025-01-14'));
    expect(result.scans).toHaveLength(1);
    expect(result.moves).toHaveLength(1);
  });

  it('gives nothing back for an empty store', () => {
    const result = restateStore(new ScanStore(), correctedClocks());
    expect(result.scans).toEqual([]);
    expect(result.dirtyDates).toEqual([]);
  });
});

describe('working out which days are wrong', () => {
  it('takes both ends of every move, once each, sorted', () => {
    expect(
      dirtyDatesOf([
        { key: 'a', from: day('2025-01-14'), to: day('2025-01-13'), shiftMs: -1 },
        { key: 'b', from: day('2025-01-14'), to: day('2025-01-13'), shiftMs: -1 },
        { key: 'c', from: day('2025-02-01'), to: day('2025-01-31'), shiftMs: -1 },
      ]),
    ).toEqual(['2025-01-13', '2025-01-14', '2025-01-31', '2025-02-01']);
  });

  it('gives nothing for no moves', () => {
    expect(dirtyDatesOf([])).toEqual([]);
  });
});
