import { checksumOf, makeEnvelope, SequenceLedger } from '../../src/ingest/envelope.js';
import { writeUploadFile } from '../../src/ingest/ndjson.js';
import type { RawScan } from '../../src/domain/scan/scan.js';
import { ScanStore } from '../../src/storage/repository/scans.js';
import { expect as expectOk } from '../../src/util/result.js';
import { clocks, rawScan, terminals } from './scans.js';
import { rawFrom, type ScanSpec } from './pipeline.js';

export interface UploadOptions {
  readonly batch?: string;
  readonly terminal?: string;
  readonly checksum?: string;
  readonly rowCount?: number;
  readonly first?: number;
  readonly last?: number;
}

export function uploadFile(specs: readonly ScanSpec[], options: UploadOptions = {}): string {
  const scans: RawScan[] = rawFrom(specs).map((row) => rawScan(row));
  const sequences = scans.map((scan) => scan.sequence);
  const envelope = expectOk(
    makeEnvelope({
      batch: options.batch ?? 'up-441',
      terminal: options.terminal ?? scans[0]?.terminalId ?? 'SUNB.01',
      uploaded: '2025-01-13T23:40:00Z',
      first: options.first ?? Math.min(...sequences),
      last: options.last ?? Math.max(...sequences),
      rows: options.rowCount ?? scans.length,
      checksum: options.checksum ?? checksumOf(scans),
      firmware: '4.11.2',
    }),
    'envelope',
  );
  return writeUploadFile(envelope, scans);
}

export function ingestContext(overrides: Record<string, unknown> = {}) {
  return {
    terminals: terminals(),
    clocks: clocks(),
    scans: new ScanStore(),
    sequences: new SequenceLedger(),
    receivedAt: new Date('2025-01-13T23:59:00Z'),
    ...overrides,
  };
}
