import { DiagnosticBag } from '../util/diagnostic.js';
import { err, ok, type Result } from '../util/result.js';
import type { Journal } from './journal.js';
import type { JournalRecord } from './journal-format.js';
import { readSnapshot, type SnapshotManifest } from './snapshot.js';

/**
 * Bringing the store back after a restart. The snapshot is the state as of one
 * journal sequence, and everything after that sequence is applied in order.
 *
 * Two failures matter and both have bitten. A snapshot ahead of the journal
 * means somebody restored an old journal over a new snapshot, and replaying
 * that silently loses a day. A record whose kind nothing handles means this
 * build is older than the one that wrote the journal, and quietly skipping it
 * produces a store that is wrong in a way nothing later can notice.
 */

export type Reducer<S> = (state: S, record: JournalRecord) => S;

export interface ReplayHandlers<S> {
  readonly initial: () => S;
  readonly handlers: Readonly<Record<string, Reducer<S>>>;
  /** Kinds this build knows about but deliberately does nothing with. */
  readonly ignored?: readonly string[] | undefined;
}

export interface ReplayResult<S> {
  readonly state: S;
  readonly fromSnapshot: boolean;
  readonly snapshot: SnapshotManifest | undefined;
  readonly applied: number;
  readonly skipped: number;
  readonly diagnostics: DiagnosticBag;
}

export interface ReplayOptions<S> extends ReplayHandlers<S> {
  readonly journal: Journal;
  readonly snapshotPath?: string | undefined;
  /** Carry on past a record kind nothing handles. Off by default. */
  readonly tolerateUnknown?: boolean | undefined;
}

export function replay<S>(options: ReplayOptions<S>): Result<ReplayResult<S>> {
  const diagnostics = new DiagnosticBag();
  const ignored = new Set(options.ignored ?? []);

  let state = options.initial();
  let manifest: SnapshotManifest | undefined;
  let fromSequence = 0;

  if (options.snapshotPath !== undefined) {
    const loaded = readSnapshot<S>(options.snapshotPath);
    if (!loaded.ok) return loaded;
    if (loaded.value !== undefined) {
      manifest = loaded.value.manifest;
      state = loaded.value.state;
      fromSequence = manifest.throughSequence;
    }
  }

  if (fromSequence > options.journal.head) {
    return err(
      `the snapshot is current to ${fromSequence} and the journal only reaches ${options.journal.head}`,
    );
  }

  let applied = 0;
  let skipped = 0;
  for (const record of options.journal.since(fromSequence)) {
    const handler = options.handlers[record.kind];
    if (handler === undefined) {
      if (ignored.has(record.kind)) {
        skipped += 1;
        continue;
      }
      if (options.tolerateUnknown === true) {
        skipped += 1;
        diagnostics.warn('replay.unknown_kind', `nothing handles ${record.kind}`, {
          kind: record.kind,
          sequence: record.sequence,
        });
        continue;
      }
      return err(`record ${record.sequence} is a ${record.kind} and nothing handles it`);
    }
    state = handler(state, record);
    applied += 1;
  }

  return ok({
    state,
    fromSnapshot: manifest !== undefined,
    snapshot: manifest,
    applied,
    skipped,
    diagnostics,
  });
}

/** Records the journal holds that this build would refuse to replay. */
export function unhandledKinds<S>(journal: Journal, handlers: ReplayHandlers<S>): string[] {
  const known = new Set([...Object.keys(handlers.handlers), ...(handlers.ignored ?? [])]);
  const missing = new Set<string>();
  for (const record of journal.all()) {
    if (!known.has(record.kind)) missing.add(record.kind);
  }
  return [...missing].sort();
}
