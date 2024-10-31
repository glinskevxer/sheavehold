import { z } from 'zod';
import type { TerminalId } from '../util/ids.js';
import { parseTerminalId } from '../util/ids.js';
import { DiagnosticBag } from '../util/diagnostic.js';
import { err, ok, type Result } from '../util/result.js';
import { scanKey, type RawScan } from '../domain/scan/scan.js';

/**
 * A terminal uploads in batches and wraps each one in an envelope. The envelope
 * is the only thing that can tell us a batch is short: the rows themselves look
 * perfectly reasonable when half of them are missing.
 *
 * The checksum is the terminal's own, an FNV-1a over the canonical row text.
 * It is weak and it is not a security control. It catches the failure it was
 * put there for, which is a radio link that drops bytes on a long upload.
 */

export interface UploadEnvelope {
  readonly batchId: string;
  readonly terminalId: TerminalId;
  readonly uploadedAt: Date;
  readonly firstSequence: number;
  readonly lastSequence: number;
  readonly rowCount: number;
  readonly checksum: string;
  readonly firmware: string;
}

export const envelopeSchema = z.object({
  batch: z.string().min(1),
  terminal: z.string().min(1),
  uploaded: z.string().min(1),
  first: z.number().int().nonnegative(),
  last: z.number().int().nonnegative(),
  rows: z.number().int().nonnegative(),
  checksum: z.string().min(1),
  firmware: z.string().default('unknown'),
});

export type EnvelopeRow = z.infer<typeof envelopeSchema>;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** The terminal's canonical row text, which is what it checksums. */
export function canonicalRow(scan: RawScan): string {
  return [
    scan.terminalId,
    String(scan.sequence),
    scan.mediaSerial,
    scan.reportedAt.toISOString(),
    scan.outcome,
  ].join('|');
}

export function checksumOf(scans: readonly RawScan[]): string {
  let hash = FNV_OFFSET;
  for (const scan of scans) {
    const text = canonicalRow(scan);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, '0');
}

export function makeEnvelope(row: EnvelopeRow): Result<UploadEnvelope> {
  const terminalId = parseTerminalId(row.terminal);
  if (!terminalId.ok) return terminalId;
  const uploadedAt = new Date(row.uploaded);
  if (Number.isNaN(uploadedAt.getTime())) {
    return err(`batch ${row.batch} has an unreadable upload time`);
  }
  if (row.last < row.first) return err(`batch ${row.batch} counts backwards`);
  if (!/^[0-9a-f]{8}$/.test(row.checksum.toLowerCase())) {
    return err(`batch ${row.batch} has a checksum of ${JSON.stringify(row.checksum)}`);
  }
  return ok({
    batchId: row.batch.trim(),
    terminalId: terminalId.value,
    uploadedAt,
    firstSequence: row.first,
    lastSequence: row.last,
    rowCount: row.rows,
    checksum: row.checksum.toLowerCase(),
    firmware: row.firmware.trim(),
  });
}

export interface EnvelopeVerdict {
  readonly envelope: UploadEnvelope;
  readonly accepted: boolean;
  readonly diagnostics: DiagnosticBag;
}

/**
 * Check the rows against what the envelope claims. A checksum mismatch is
 * fatal for the batch, everything else is a complaint the rows survive.
 */
export function verifyEnvelope(
  envelope: UploadEnvelope,
  scans: readonly RawScan[],
): EnvelopeVerdict {
  const diagnostics = new DiagnosticBag();
  const source = { batch: envelope.batchId };
  let accepted = true;

  const foreign = scans.filter((scan) => scan.terminalId !== envelope.terminalId);
  if (foreign.length > 0) {
    accepted = false;
    diagnostics.error(
      'batch.foreign_rows',
      `${foreign.length} rows are not from ${envelope.terminalId}`,
      { count: foreign.length },
      source,
    );
  }

  if (scans.length !== envelope.rowCount) {
    diagnostics.error(
      'batch.row_count',
      `envelope claims ${envelope.rowCount} rows and carries ${scans.length}`,
      { claimed: envelope.rowCount, found: scans.length },
      source,
    );
    accepted = false;
  }

  const sequences = scans.map((scan) => scan.sequence);
  const lowest = sequences.length === 0 ? envelope.firstSequence : Math.min(...sequences);
  const highest = sequences.length === 0 ? envelope.lastSequence : Math.max(...sequences);
  if (lowest !== envelope.firstSequence || highest !== envelope.lastSequence) {
    diagnostics.warn(
      'batch.sequence_range',
      `envelope says ${envelope.firstSequence}..${envelope.lastSequence} and the rows run ${lowest}..${highest}`,
      { claimedFrom: envelope.firstSequence, foundFrom: lowest },
      source,
    );
  }

  const seen = new Set<string>();
  for (const scan of scans) {
    const key = scanKey(scan);
    if (seen.has(key)) {
      diagnostics.warn('batch.repeated_row', `${key} appears twice in the batch`, { key }, source);
    }
    seen.add(key);
  }

  const actual = checksumOf(scans);
  if (actual !== envelope.checksum) {
    accepted = false;
    diagnostics.error(
      'batch.checksum',
      `envelope says ${envelope.checksum} and the rows hash to ${actual}`,
      { claimed: envelope.checksum, found: actual },
      source,
    );
  }

  return { envelope, accepted, diagnostics };
}

/**
 * Remembers how far each terminal had counted, so a batch that skips forward
 * can be reported at upload time rather than at the end of the day.
 */
export class SequenceLedger {
  private readonly highest = new Map<string, number>();

  seen(terminalId: TerminalId): number | undefined {
    return this.highest.get(terminalId);
  }

  /** Records the batch and returns how many rows have never been uploaded. */
  accept(envelope: UploadEnvelope): number {
    const previous = this.highest.get(envelope.terminalId);
    const missing = previous === undefined ? 0 : Math.max(0, envelope.firstSequence - previous - 1);
    if (previous === undefined || envelope.lastSequence > previous) {
      this.highest.set(envelope.terminalId, envelope.lastSequence);
    }
    return missing;
  }

  /** True when the whole batch has already been taken in. */
  isReplay(envelope: UploadEnvelope): boolean {
    const previous = this.highest.get(envelope.terminalId);
    return previous !== undefined && envelope.lastSequence <= previous;
  }

  terminals(): TerminalId[] {
    return [...this.highest.keys()].sort() as TerminalId[];
  }
}
