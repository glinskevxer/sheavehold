import { describe, expect, it } from 'vitest';
import { ScanStore, scanKeyOf } from '../../../../src/storage/repository/scans.js';
import { normaliseScans } from '../../../../src/domain/scan/normalise.js';
import { checksumOf, makeEnvelope } from '../../../../src/ingest/envelope.js';
import { parseMediaSerial, parseTerminalId } from '../../../../src/util/ids.js';
import { expect as expectOk } from '../../../../src/util/result.js';
import { CARD_ROW, CARD_TESS } from '../../../support/media.js';
import { clocks, rawScan, terminals } from '../../../support/scans.js';
import { day } from '../../../support/season.js';

const terminal = (raw: string) => expectOk(parseTerminalId(raw), 'terminal');
const serial = (raw: string) => expectOk(parseMediaSerial(raw), 'serial');
const RECEIVED = new Date('2025-01-13T23:59:00Z');

function scans(specs: readonly { terminal?: string; media?: string; at: string; seq: number }[]) {
  return normaliseScans(
    specs.map((spec) =>
      rawScan({
        terminal: spec.terminal ?? 'SUNB.01',
        media: spec.media ?? CARD_ROW,
        at: spec.at,
        seq: spec.seq,
      }),
    ),
    { clocks: clocks(), terminals: terminals() },
  );
}

function loaded(): ScanStore {
  const store = new ScanStore();
  store.record(
    scans([
      { at: '2025-01-13T17:00:00Z', seq: 1 },
      { at: '2025-01-13T18:00:00Z', seq: 2 },
      { at: '2025-01-13T17:30:00Z', seq: 3, media: CARD_TESS, terminal: 'MEADW.01' },
      { at: '2025-01-14T17:00:00Z', seq: 4 },
    ]),
  );
  return store;
}

describe('recording scans', () => {
  it('counts what was new', () => {
    const store = new ScanStore();
    const first = store.record(scans([{ at: '2025-01-13T17:00:00Z', seq: 1 }]));
    expect(first).toEqual({ added: 1, replaced: 0 });
  });

  it('lands a re-upload on the same rows', () => {
    const store = new ScanStore();
    const batch = scans([
      { at: '2025-01-13T17:00:00Z', seq: 1 },
      { at: '2025-01-13T18:00:00Z', seq: 2 },
    ]);
    store.record(batch);
    expect(store.record(batch)).toEqual({ added: 0, replaced: 2 });
    expect(store.scans.size).toBe(2);
  });

  it('keys on the terminal and the sequence, zero padded so it sorts', () => {
    const [scan] = scans([{ at: '2025-01-13T17:00:00Z', seq: 42 }]);
    expect(scanKeyOf(scan!)).toBe('SUNB.01#000000042');
  });
});

describe('reading scans back', () => {
  it('slices a day in time order', () => {
    const store = loaded();
    const rows = store.onDate(day('2025-01-13'));
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.sequence)).toEqual([1, 3, 2]);
    expect(store.countOnDate(day('2025-01-13'))).toBe(3);
    expect(store.onDate(day('2025-02-01'))).toEqual([]);
  });

  it('lists the dates it holds', () => {
    expect(loaded().dates()).toEqual(['2025-01-13', '2025-01-14']);
  });

  it('follows one card, over the season and over one day', () => {
    const store = loaded();
    expect(store.ofMedia(CARD_ROW)).toHaveLength(3);
    expect(store.ofMediaOnDate(CARD_ROW, day('2025-01-13'))).toHaveLength(2);
    expect(store.ofMedia(serial('E2004A1B0000FFFF'))).toEqual([]);
  });

  it('follows one gate in sequence order', () => {
    const store = loaded();
    expect(store.onTerminal(terminal('SUNB.01')).map((row) => row.sequence)).toEqual([1, 2, 4]);
    expect(store.onTerminal(terminal('BOWL.01'))).toEqual([]);
  });

  it('forgets a day so it can be rebuilt', () => {
    const store = loaded();
    expect(store.forgetDate(day('2025-01-13'))).toBe(3);
    expect(store.scans.size).toBe(1);
    expect(store.forgetDate(day('2025-01-13'))).toBe(0);
  });
});

describe('recording batches', () => {
  const envelope = (batch: string) =>
    expectOk(
      makeEnvelope({
        batch,
        terminal: 'SUNB.01',
        uploaded: '2025-01-13T23:40:00Z',
        first: 1,
        last: 2,
        rows: 2,
        checksum: checksumOf([]),
        firmware: '4.11.2',
      }),
      'envelope',
    );

  it('remembers a batch and whether it was taken', () => {
    const store = new ScanStore();
    const row = store.recordBatch(envelope('up-441'), true, RECEIVED);
    expect(row.receivedAt).toBe('2025-01-13T23:59:00.000Z');
    expect(store.hasBatch('up-441')).toBe(true);
    expect(store.hasBatch('up-999')).toBe(false);
  });

  it('lists a gate uploads in order and the ones that were refused', () => {
    const store = new ScanStore();
    store.recordBatch(envelope('up-442'), false, RECEIVED);
    store.recordBatch(envelope('up-441'), true, RECEIVED);
    expect(store.batchesOfTerminal(terminal('SUNB.01'))).toHaveLength(2);
    expect(store.refusedBatches().map((row) => row.batchId)).toEqual(['up-442']);
    expect(store.counts()).toEqual({ scans: 0, batches: 2 });
  });

  it('replaces a batch recorded twice rather than doubling it', () => {
    const store = new ScanStore();
    store.recordBatch(envelope('up-441'), false, RECEIVED);
    store.recordBatch(envelope('up-441'), true, RECEIVED);
    expect(store.batches.size).toBe(1);
    expect(store.refusedBatches()).toEqual([]);
  });
});
