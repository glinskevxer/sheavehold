import { distinctSorted } from '../util/collect.js';
import { DiagnosticBag } from '../util/diagnostic.js';
import { err, ok, type Result } from '../util/result.js';
import type { OperatingDate } from '../util/clock.js';
import type { ClockBook } from '../domain/scan/clock-skew.js';
import type { TerminalRegistry } from '../domain/lift/terminal.js';
import { normaliseScans, type NormalisedScan } from '../domain/scan/normalise.js';
import { verifyEnvelope, type SequenceLedger } from '../ingest/envelope.js';
import { readUploadFile } from '../ingest/ndjson.js';
import type { ScanStore } from '../storage/repository/scans.js';

/**
 * One upload, end to end. Read it, check it against its envelope, put it on the
 * area timeline, and write the scans down. What it deliberately does not do is
 * build rides: that is a recompute over a whole day and it runs after the
 * uploads for that day have stopped arriving, because a day rebuilt from half
 * its gates is worse than a day nobody has rebuilt yet.
 *
 * The receipt is what the gate operator sees and what goes in the journal.
 */

export interface IngestReceipt {
  readonly batchId: string;
  readonly accepted: boolean;
  readonly rowsRead: number;
  readonly rowsStored: number;
  readonly rowsReplaced: number;
  readonly datesTouched: readonly OperatingDate[];
  readonly missingBefore: number;
  readonly replay: boolean;
  readonly diagnostics: DiagnosticBag;
}

export interface IngestContext {
  readonly terminals: TerminalRegistry;
  readonly clocks: ClockBook;
  readonly scans: ScanStore;
  readonly sequences: SequenceLedger;
  readonly receivedAt?: Date | undefined;
  /** Store the scans even when the envelope did not check out. Off by default. */
  readonly storeUnverified?: boolean | undefined;
}

export function ingestUpload(text: string, context: IngestContext): Result<IngestReceipt> {
  const file = readUploadFile(text);
  if (!file.ok) return file;

  const { envelope, scans } = file.value;
  const diagnostics = new DiagnosticBag();
  diagnostics.merge(file.value.diagnostics);
  const receivedAt = context.receivedAt ?? new Date();

  if (context.scans.hasBatch(envelope.batchId)) {
    diagnostics.info('ingest.seen_before', `batch ${envelope.batchId} has been in before`, {
      batch: envelope.batchId,
    });
  }

  const verdict = verifyEnvelope(envelope, scans);
  diagnostics.merge(verdict.diagnostics);

  const replay = context.sequences.isReplay(envelope);
  const missingBefore = context.sequences.accept(envelope);
  if (missingBefore > 0) {
    diagnostics.warn(
      'ingest.sequence_hole',
      `${missingBefore} rows before this batch have never arrived`,
      { missing: missingBefore, terminal: envelope.terminalId },
      { batch: envelope.batchId },
    );
  }

  let normalised: NormalisedScan[] = [];
  let stored = { added: 0, replaced: 0 };
  if (verdict.accepted || context.storeUnverified === true) {
    normalised = normaliseScans(scans, {
      terminals: context.terminals,
      clocks: context.clocks,
      diagnostics,
      batch: envelope.batchId,
    });
    stored = context.scans.record(normalised);
  } else {
    diagnostics.warn('ingest.not_stored', 'the batch failed its envelope and was not stored', {
      batch: envelope.batchId,
    });
  }

  context.scans.recordBatch(envelope, verdict.accepted, receivedAt);

  return ok({
    batchId: envelope.batchId,
    accepted: verdict.accepted,
    rowsRead: scans.length,
    rowsStored: stored.added,
    rowsReplaced: stored.replaced,
    datesTouched: distinctSorted(normalised, (scan) => scan.operatingDate) as OperatingDate[],
    missingBefore,
    replay,
    diagnostics,
  });
}

/** Several uploads in one go, stopping at the first unreadable file. */
export function ingestUploads(
  files: readonly { name: string; text: string }[],
  context: IngestContext,
): Result<IngestReceipt[]> {
  const receipts: IngestReceipt[] = [];
  for (const file of files) {
    const receipt = ingestUpload(file.text, context);
    if (!receipt.ok) return err(`${file.name}: ${receipt.error}`);
    receipts.push(receipt.value);
  }
  return ok(receipts);
}

export function datesTouchedBy(receipts: readonly IngestReceipt[]): OperatingDate[] {
  const dates = new Set<string>();
  for (const receipt of receipts) {
    for (const date of receipt.datesTouched) dates.add(date);
  }
  return [...dates].sort() as OperatingDate[];
}
