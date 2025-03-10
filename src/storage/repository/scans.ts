import type { OperatingDate } from '../../util/clock.js';
import type { NormalisedScan } from '../../domain/scan/normalise.js';
import type { UploadEnvelope } from '../../ingest/envelope.js';
import type { MediaSerial, TerminalId } from '../../util/ids.js';
import { Table } from '../table.js';

/**
 * Every normalised scan, kept because the exception register has to be able to
 * show the reads behind a finding and because a rule change means recomputing
 * the rides from the scans rather than asking the gates for the day again.
 *
 * The primary key is terminal and sequence, which is the only thing a gate
 * guarantees is unique. Re-uploading a batch therefore lands on the same rows
 * rather than doubling the day, and that property is what makes the whole
 * ingest safe to run twice.
 */

export interface StoredBatch {
  readonly batchId: string;
  readonly terminalId: TerminalId;
  readonly uploadedAt: string;
  readonly rowCount: number;
  readonly checksum: string;
  readonly accepted: boolean;
  readonly firstSequence: number;
  readonly lastSequence: number;
  readonly receivedAt: string;
}

export function scanKeyOf(scan: NormalisedScan): string {
  return `${scan.terminalId}#${String(scan.sequence).padStart(9, '0')}`;
}

export class ScanStore {
  readonly scans = new Table<NormalisedScan>({
    name: 'scans',
    primaryKey: scanKeyOf,
    indexes: [
      { name: 'date', keys: (row) => [row.operatingDate] },
      { name: 'terminal', keys: (row) => [row.terminalId] },
      { name: 'media', keys: (row) => [row.mediaSerial] },
      { name: 'media_day', keys: (row) => [`${row.mediaSerial}#${row.operatingDate}`] },
      { name: 'lift_day', keys: (row) => [`${row.lift}#${row.operatingDate}`] },
    ],
  });

  readonly batches = new Table<StoredBatch>({
    name: 'batches',
    primaryKey: (row) => row.batchId,
    indexes: [
      { name: 'terminal', keys: (row) => [row.terminalId] },
      { name: 'accepted', keys: (row) => [row.accepted ? 'yes' : 'no'] },
    ],
  });

  /** Returns how many rows were new, which is what the receipt reports. */
  record(scans: readonly NormalisedScan[]): { added: number; replaced: number } {
    let added = 0;
    let replaced = 0;
    for (const scan of scans) {
      if (this.scans.has(scanKeyOf(scan))) replaced += 1;
      else added += 1;
      this.scans.upsert(scan);
    }
    return { added, replaced };
  }

  recordBatch(envelope: UploadEnvelope, accepted: boolean, receivedAt: Date): StoredBatch {
    const row: StoredBatch = {
      batchId: envelope.batchId,
      terminalId: envelope.terminalId,
      uploadedAt: envelope.uploadedAt.toISOString(),
      rowCount: envelope.rowCount,
      checksum: envelope.checksum,
      accepted,
      firstSequence: envelope.firstSequence,
      lastSequence: envelope.lastSequence,
      receivedAt: receivedAt.toISOString(),
    };
    this.batches.upsert(row);
    return row;
  }

  hasBatch(batchId: string): boolean {
    return this.batches.has(batchId);
  }

  onDate(date: OperatingDate): NormalisedScan[] {
    return this.scans.by('date', date).sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  ofMedia(serial: MediaSerial): NormalisedScan[] {
    return this.scans.by('media', serial).sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  ofMediaOnDate(serial: MediaSerial, date: OperatingDate): NormalisedScan[] {
    return this.scans
      .by('media_day', `${serial}#${date}`)
      .sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  onTerminal(terminalId: TerminalId): NormalisedScan[] {
    return this.scans.by('terminal', terminalId).sort((a, b) => a.sequence - b.sequence);
  }

  dates(): OperatingDate[] {
    return this.scans.keysOf('date') as OperatingDate[];
  }

  countOnDate(date: OperatingDate): number {
    return this.scans.countBy('date', date);
  }

  batchesOfTerminal(terminalId: TerminalId): StoredBatch[] {
    return this.batches
      .by('terminal', terminalId)
      .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  }

  refusedBatches(): StoredBatch[] {
    return this.batches.by('accepted', 'no');
  }

  /** Drop a day so it can be rebuilt from a fresh upload. */
  forgetDate(date: OperatingDate): number {
    const doomed = this.scans.by('date', date);
    for (const scan of doomed) this.scans.delete(scanKeyOf(scan));
    return doomed.length;
  }

  counts(): Record<string, number> {
    return { scans: this.scans.size, batches: this.batches.size };
  }
}
