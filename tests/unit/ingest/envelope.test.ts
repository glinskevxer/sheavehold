import { describe, expect, it } from 'vitest';
import {
  canonicalRow,
  checksumOf,
  makeEnvelope,
  SequenceLedger,
  verifyEnvelope,
  type EnvelopeRow,
  type UploadEnvelope,
} from '../../../src/ingest/envelope.js';
import type { RawScan } from '../../../src/domain/scan/scan.js';
import { expect as expectOk, isErr } from '../../../src/util/result.js';
import { rawScan } from '../../support/scans.js';

const rows: RawScan[] = [
  rawScan({ seq: 1, at: '2025-01-13T16:14:07Z' }),
  rawScan({ seq: 2, at: '2025-01-13T16:14:19Z', media: 'E2004A1B00000456' }),
  rawScan({ seq: 3, at: '2025-01-13T16:15:02Z', outcome: 'reject', reason: 'no entitlement' }),
];

function envelopeOf(overrides: Partial<EnvelopeRow> = {}): UploadEnvelope {
  return expectOk(
    makeEnvelope({
      batch: 'up-441',
      terminal: 'SUNB.01',
      uploaded: '2025-01-13T23:40:00Z',
      first: 1,
      last: 3,
      rows: 3,
      checksum: checksumOf(rows),
      firmware: '4.11.2',
      ...overrides,
    }),
    'envelope',
  );
}

describe('the checksum', () => {
  it('writes a row the way the terminal writes it', () => {
    expect(canonicalRow(rows[0]!)).toBe(
      'SUNB.01|1|E2004A1B00000123|2025-01-13T16:14:07.000Z|accept',
    );
  });

  it('gives eight hex digits and depends on every row', () => {
    const sum = checksumOf(rows);
    expect(sum).toMatch(/^[0-9a-f]{8}$/);
    expect(checksumOf(rows.slice(0, 2))).not.toBe(sum);
    expect(checksumOf([...rows].reverse())).not.toBe(sum);
  });

  it('hashes an empty batch to the offset basis', () => {
    expect(checksumOf([])).toBe('811c9dc5');
  });
});

describe('building an envelope', () => {
  it('folds the checksum and trims the ids', () => {
    const envelope = envelopeOf({ checksum: checksumOf(rows).toUpperCase(), batch: ' up-441 ' });
    expect(envelope.checksum).toBe(checksumOf(rows));
    expect(envelope.batchId).toBe('up-441');
  });

  it('defaults the firmware when the gate did not say', () => {
    const parsed = expectOk(
      makeEnvelope({
        batch: 'up-1',
        terminal: 'SUNB.01',
        uploaded: '2025-01-13T23:40:00Z',
        first: 1,
        last: 1,
        rows: 1,
        checksum: '00000000',
        firmware: 'unknown',
      }),
      'envelope',
    );
    expect(parsed.firmware).toBe('unknown');
  });

  it('refuses a bad terminal, time, range or checksum', () => {
    expect(
      isErr(
        makeEnvelope({
          ...envelopeOf(),
          terminal: 'SUNB',
          uploaded: 'x',
          batch: 'b',
          first: 1,
          last: 1,
          rows: 1,
          checksum: '00000000',
          firmware: 'a',
        }),
      ),
    ).toBe(true);
    expect(
      isErr(
        makeEnvelope({
          batch: 'b',
          terminal: 'SUNB.01',
          uploaded: 'never',
          first: 1,
          last: 1,
          rows: 1,
          checksum: '00000000',
          firmware: 'a',
        }),
      ),
    ).toBe(true);
    expect(
      isErr(
        makeEnvelope({
          batch: 'b',
          terminal: 'SUNB.01',
          uploaded: '2025-01-13T23:40:00Z',
          first: 9,
          last: 1,
          rows: 1,
          checksum: '00000000',
          firmware: 'a',
        }),
      ),
    ).toBe(true);
    expect(
      isErr(
        makeEnvelope({
          batch: 'b',
          terminal: 'SUNB.01',
          uploaded: '2025-01-13T23:40:00Z',
          first: 1,
          last: 1,
          rows: 1,
          checksum: 'zz',
          firmware: 'a',
        }),
      ),
    ).toBe(true);
  });
});

describe('verifying a batch against its envelope', () => {
  it('accepts a batch that matches', () => {
    const verdict = verifyEnvelope(envelopeOf(), rows);
    expect(verdict.accepted).toBe(true);
    expect(verdict.diagnostics.length).toBe(0);
  });

  it('refuses a batch whose rows do not hash to the claim', () => {
    const verdict = verifyEnvelope(envelopeOf({ checksum: '00000000' }), rows);
    expect(verdict.accepted).toBe(false);
    expect(verdict.diagnostics.has('batch.checksum')).toBe(true);
  });

  it('refuses a short batch and says how short', () => {
    const verdict = verifyEnvelope(envelopeOf(), rows.slice(0, 2));
    expect(verdict.accepted).toBe(false);
    expect(verdict.diagnostics.has('batch.row_count')).toBe(true);
    const entry = verdict.diagnostics.bySeverity('error')[0];
    expect(entry?.context).toMatchObject({ claimed: 3, found: 2 });
  });

  it('refuses rows from another gate', () => {
    const stranger = rawScan({ terminal: 'RIDGE.01', seq: 4 });
    const mixed = [...rows, stranger];
    const verdict = verifyEnvelope(
      envelopeOf({ rows: 4, last: 4, checksum: checksumOf(mixed) }),
      mixed,
    );
    expect(verdict.accepted).toBe(false);
    expect(verdict.diagnostics.has('batch.foreign_rows')).toBe(true);
  });

  it('warns when the range does not match but keeps the batch', () => {
    const verdict = verifyEnvelope(envelopeOf({ first: 0 }), rows);
    expect(verdict.accepted).toBe(true);
    expect(verdict.diagnostics.has('batch.sequence_range')).toBe(true);
  });

  it('warns about a row the gate sent twice', () => {
    const doubled = [...rows, rows[1]!];
    const verdict = verifyEnvelope(envelopeOf({ rows: 4, checksum: checksumOf(doubled) }), doubled);
    expect(verdict.diagnostics.has('batch.repeated_row')).toBe(true);
    expect(verdict.accepted).toBe(true);
  });

  it('carries the batch label onto every complaint', () => {
    const verdict = verifyEnvelope(envelopeOf({ checksum: '00000000' }), rows);
    for (const entry of verdict.diagnostics.all()) {
      expect(entry.source).toEqual({ batch: 'up-441' });
    }
  });

  it('handles an empty batch the envelope agrees is empty', () => {
    const empty = envelopeOf({ rows: 0, first: 1, last: 1, checksum: checksumOf([]) });
    expect(verifyEnvelope(empty, []).accepted).toBe(true);
  });
});

describe('the sequence ledger', () => {
  it('remembers how far a terminal had counted', () => {
    const ledger = new SequenceLedger();
    expect(ledger.seen(envelopeOf().terminalId)).toBeUndefined();
    expect(ledger.accept(envelopeOf())).toBe(0);
    expect(ledger.seen(envelopeOf().terminalId)).toBe(3);
  });

  it('counts the rows a jump forward skipped', () => {
    const ledger = new SequenceLedger();
    ledger.accept(envelopeOf());
    expect(ledger.accept(envelopeOf({ batch: 'up-442', first: 9, last: 12 }))).toBe(5);
  });

  it('counts nothing when the next batch carries on', () => {
    const ledger = new SequenceLedger();
    ledger.accept(envelopeOf());
    expect(ledger.accept(envelopeOf({ batch: 'up-442', first: 4, last: 6 }))).toBe(0);
  });

  it('spots a batch that has already been taken in', () => {
    const ledger = new SequenceLedger();
    ledger.accept(envelopeOf());
    expect(ledger.isReplay(envelopeOf())).toBe(true);
    expect(ledger.isReplay(envelopeOf({ batch: 'up-442', first: 4, last: 6 }))).toBe(false);
  });

  it('never walks the high water mark backwards', () => {
    const ledger = new SequenceLedger();
    ledger.accept(envelopeOf({ first: 10, last: 20 }));
    ledger.accept(envelopeOf({ first: 1, last: 3 }));
    expect(ledger.seen(envelopeOf().terminalId)).toBe(20);
    expect(ledger.terminals()).toEqual(['SUNB.01']);
  });
});
