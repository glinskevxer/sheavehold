import { DiagnosticBag } from '../util/diagnostic.js';
import { err, ok, type Result } from '../util/result.js';
import type { Journal } from './journal.js';
import type { JournalRecord } from './journal-format.js';
import { writeSnapshot, type SnapshotManifest } from './snapshot.js';

/**
 * By April the journal is a few hundred megabytes and almost all of it is
 * already in the snapshot. Compaction takes a fresh snapshot and then drops the
 * records the snapshot covers.
 *
 * It keeps a tail on purpose. If the snapshot turns out to be wrong we want to
 * be able to rebuild the last few days from the journal, and a compaction that
 * leaves nothing behind removes that option at the exact moment somebody needs
 * it. The tail is a number of records, not days, because a day in April is a
 * hundredth the size of a day at Christmas.
 */

export const DEFAULT_KEEP_RECORDS = 5_000;

export interface CompactionOptions<S> {
  readonly journal: Journal;
  readonly snapshotPath: string;
  readonly state: S;
  /** Journal sequence the state is current as of. */
  readonly throughSequence: number;
  readonly keepRecords?: number | undefined;
  readonly takenAt?: Date | undefined;
  readonly counts?: Readonly<Record<string, number>> | undefined;
}

export interface CompactionResult {
  readonly manifest: SnapshotManifest;
  readonly recordsBefore: number;
  readonly recordsAfter: number;
  readonly dropped: number;
  readonly keptFromSequence: number;
  readonly diagnostics: DiagnosticBag;
}

/** The records a compaction would keep, without touching anything. */
export function recordsToKeep(
  records: readonly JournalRecord[],
  throughSequence: number,
  keepRecords: number,
): JournalRecord[] {
  const covered = records.filter((record) => record.sequence <= throughSequence);
  const uncovered = records.filter((record) => record.sequence > throughSequence);
  const tail = keepRecords <= 0 ? [] : covered.slice(Math.max(0, covered.length - keepRecords));
  return [...tail, ...uncovered];
}

export function compact<S>(options: CompactionOptions<S>): Result<CompactionResult> {
  const keep = options.keepRecords ?? DEFAULT_KEEP_RECORDS;
  if (!Number.isInteger(keep) || keep < 0) return err(`the tail cannot be ${keep} records`);
  if (options.throughSequence > options.journal.head) {
    return err(
      `asked to snapshot through ${options.throughSequence} and the journal reaches ${options.journal.head}`,
    );
  }

  const diagnostics = new DiagnosticBag();
  const before = options.journal.length;

  const writeOptions: { takenAt?: Date; counts?: Readonly<Record<string, number>> } = {};
  if (options.takenAt !== undefined) writeOptions.takenAt = options.takenAt;
  if (options.counts !== undefined) writeOptions.counts = options.counts;

  const manifest = writeSnapshot(
    options.snapshotPath,
    options.state,
    options.throughSequence,
    writeOptions,
  );

  const kept = recordsToKeep(options.journal.all(), options.throughSequence, keep);
  options.journal.replace(kept);

  const dropped = before - kept.length;
  if (dropped === 0) {
    diagnostics.info('compaction.nothing', 'the journal was already inside the tail');
  } else {
    diagnostics.info('compaction.done', `dropped ${dropped} records`, { dropped });
  }

  return ok({
    manifest,
    recordsBefore: before,
    recordsAfter: kept.length,
    dropped,
    keptFromSequence: kept[0]?.sequence ?? 0,
    diagnostics,
  });
}

/** Whether a compaction is worth running yet. */
export function shouldCompact(
  journal: Journal,
  throughSequence: number,
  keepRecords = DEFAULT_KEEP_RECORDS,
): boolean {
  const covered = journal.all().filter((record) => record.sequence <= throughSequence).length;
  return covered > keepRecords * 2;
}
