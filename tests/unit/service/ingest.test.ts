import { describe, expect, it } from 'vitest';
import { datesTouchedBy, ingestUpload, ingestUploads } from '../../../src/service/ingest.js';
import { expect as expectOk } from '../../../src/util/result.js';
import { CARD_TESS } from '../../support/media.js';
import { ingestContext, uploadFile } from '../../support/uploads.js';

const SPECS = [
  { at: '2025-01-13T17:00:00Z', seq: 1 },
  { at: '2025-01-13T18:00:00Z', seq: 2 },
  { at: '2025-01-13T19:00:00Z', seq: 3, media: CARD_TESS },
];

describe('taking one upload in', () => {
  it('stores every row and reports what it did', () => {
    const context = ingestContext();
    const receipt = expectOk(ingestUpload(uploadFile(SPECS), context), 'ingest');
    expect(receipt).toMatchObject({
      batchId: 'up-441',
      accepted: true,
      rowsRead: 3,
      rowsStored: 3,
      rowsReplaced: 0,
      replay: false,
      missingBefore: 0,
    });
    expect(receipt.datesTouched).toEqual(['2025-01-13']);
    expect(context.scans.scans.size).toBe(3);
  });

  it('records the batch whether or not it was taken', () => {
    const context = ingestContext();
    ingestUpload(uploadFile(SPECS), context);
    expect(context.scans.hasBatch('up-441')).toBe(true);
    expect(context.scans.refusedBatches()).toEqual([]);
  });

  it('lands a second upload of the same batch on the same rows', () => {
    const context = ingestContext();
    ingestUpload(uploadFile(SPECS), context);
    const again = expectOk(ingestUpload(uploadFile(SPECS), context), 'ingest');
    expect(again.rowsStored).toBe(0);
    expect(again.rowsReplaced).toBe(3);
    expect(again.replay).toBe(true);
    expect(again.diagnostics.has('ingest.seen_before')).toBe(true);
    expect(context.scans.scans.size).toBe(3);
  });

  it('refuses to store a batch that fails its envelope', () => {
    const context = ingestContext();
    const receipt = expectOk(
      ingestUpload(uploadFile(SPECS, { checksum: '00000000' }), context),
      'ingest',
    );
    expect(receipt.accepted).toBe(false);
    expect(receipt.rowsStored).toBe(0);
    expect(receipt.diagnostics.has('ingest.not_stored')).toBe(true);
    expect(context.scans.scans.size).toBe(0);
    expect(context.scans.refusedBatches()).toHaveLength(1);
  });

  it('stores an unverified batch when the operator insists', () => {
    const context = ingestContext({ storeUnverified: true });
    const receipt = expectOk(
      ingestUpload(uploadFile(SPECS, { checksum: '00000000' }), context),
      'ingest',
    );
    expect(receipt.accepted).toBe(false);
    expect(receipt.rowsStored).toBe(3);
  });
});

describe('what an upload tells the operator', () => {
  it('notices rows that never arrived', () => {
    const context = ingestContext();
    ingestUpload(uploadFile(SPECS), context);
    const later = expectOk(
      ingestUpload(
        uploadFile([{ at: '2025-01-13T20:00:00Z', seq: 9 }], { batch: 'up-442' }),
        context,
      ),
      'ingest',
    );
    expect(later.missingBefore).toBe(5);
    expect(later.diagnostics.has('ingest.sequence_hole')).toBe(true);
  });

  it('passes a file it cannot read straight back', () => {
    expect(ingestUpload('not an upload', ingestContext()).ok).toBe(false);
  });

  it('drops a row from a gate nobody has on file and says so', () => {
    const context = ingestContext();
    const receipt = expectOk(
      ingestUpload(
        uploadFile([{ at: '2025-01-13T17:00:00Z', seq: 1, terminal: 'GHOST.01' }], {
          terminal: 'GHOST.01',
        }),
        context,
      ),
      'ingest',
    );
    expect(receipt.rowsStored).toBe(0);
    expect(receipt.diagnostics.has('scan.unknown_terminal')).toBe(true);
  });

  it('reports every day the upload touched', () => {
    const context = ingestContext();
    const receipt = expectOk(
      ingestUpload(
        uploadFile([
          { at: '2025-01-13T17:00:00Z', seq: 1 },
          { at: '2025-01-14T17:00:00Z', seq: 2 },
        ]),
        context,
      ),
      'ingest',
    );
    expect(receipt.datesTouched).toEqual(['2025-01-13', '2025-01-14']);
  });
});

describe('taking several uploads in', () => {
  it('runs them in order and collects the receipts', () => {
    const context = ingestContext();
    const receipts = expectOk(
      ingestUploads(
        [
          { name: 'sunb.ndjson', text: uploadFile(SPECS) },
          {
            name: 'meadw.ndjson',
            text: uploadFile([{ at: '2025-01-14T17:00:00Z', seq: 1, terminal: 'MEADW.01' }], {
              batch: 'up-442',
              terminal: 'MEADW.01',
            }),
          },
        ],
        context,
      ),
      'ingest',
    );
    expect(receipts).toHaveLength(2);
    expect(datesTouchedBy(receipts)).toEqual(['2025-01-13', '2025-01-14']);
  });

  it('stops at the first file it cannot read and names it', () => {
    const result = ingestUploads(
      [
        { name: 'good.ndjson', text: uploadFile(SPECS) },
        { name: 'bad.ndjson', text: 'rubbish' },
      ],
      ingestContext(),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.startsWith('bad.ndjson:')).toBe(true);
  });

  it('gives nothing for no files', () => {
    expect(expectOk(ingestUploads([], ingestContext()), 'ingest')).toEqual([]);
    expect(datesTouchedBy([])).toEqual([]);
  });
});
