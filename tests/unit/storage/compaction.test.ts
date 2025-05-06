import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compact,
  DEFAULT_KEEP_RECORDS,
  recordsToKeep,
  shouldCompact,
} from '../../../src/storage/compaction.js';
import { Journal } from '../../../src/storage/journal.js';
import { readSnapshot } from '../../../src/storage/snapshot.js';
import { expect as expectOk } from '../../../src/util/result.js';
import { tempDir } from '../../support/tempdir.js';

const AT = new Date('2025-02-06T23:40:00Z');

function journalOf(dir: string, count: number): Journal {
  const journal = Journal.open(join(dir, 'journal.log')).journal;
  journal.appendAll(
    Array.from({ length: count }, (_, i) => ({ kind: 'ride.built', body: { n: i }, at: AT })),
  );
  return journal;
}

describe('choosing what to keep', () => {
  const records = Array.from({ length: 10 }, (_, i) => ({
    sequence: i + 1,
    kind: 'a',
    at: AT.toISOString(),
    body: {},
  }));

  it('keeps everything after the snapshot plus a tail before it', () => {
    const kept = recordsToKeep(records, 6, 2);
    expect(kept.map((record) => record.sequence)).toEqual([5, 6, 7, 8, 9, 10]);
  });

  it('keeps nothing before the snapshot when the tail is zero', () => {
    expect(recordsToKeep(records, 6, 0).map((record) => record.sequence)).toEqual([7, 8, 9, 10]);
  });

  it('keeps everything when the tail is wider than the history', () => {
    expect(recordsToKeep(records, 6, 99)).toHaveLength(10);
  });

  it('keeps everything when the snapshot covers nothing', () => {
    expect(recordsToKeep(records, 0, 2)).toHaveLength(10);
  });
});

describe('compacting', () => {
  it('writes the snapshot and shortens the journal', () => {
    const dir = tempDir();
    const journal = journalOf(dir, 20);
    const snapshotPath = join(dir, 'snapshot.json');
    const result = expectOk(
      compact({
        journal,
        snapshotPath,
        state: { rides: 20 },
        throughSequence: 15,
        keepRecords: 3,
        takenAt: AT,
        counts: { rides: 20 },
      }),
      'compact',
    );
    expect(result.recordsBefore).toBe(20);
    expect(result.recordsAfter).toBe(8);
    expect(result.dropped).toBe(12);
    expect(result.keptFromSequence).toBe(13);
    expect(result.manifest.throughSequence).toBe(15);
  });

  it('leaves a journal that reopens and carries on numbering', () => {
    const dir = tempDir();
    const journal = journalOf(dir, 20);
    compact({
      journal,
      snapshotPath: join(dir, 'snapshot.json'),
      state: {},
      throughSequence: 15,
      keepRecords: 3,
      takenAt: AT,
    });
    const reopened = Journal.open(join(dir, 'journal.log'));
    expect(reopened.recovered).toBe(8);
    expect(reopened.journal.append({ kind: 'a', body: {}, at: AT }).sequence).toBe(21);
  });

  it('leaves a snapshot that reads back', () => {
    const dir = tempDir();
    const snapshotPath = join(dir, 'snapshot.json');
    compact({
      journal: journalOf(dir, 5),
      snapshotPath,
      state: { rides: 5 },
      throughSequence: 5,
      takenAt: AT,
    });
    const read = expectOk(readSnapshot<{ rides: number }>(snapshotPath), 'snapshot');
    expect(read?.state.rides).toBe(5);
  });

  it('says when it had nothing to do', () => {
    const dir = tempDir();
    const result = expectOk(
      compact({
        journal: journalOf(dir, 4),
        snapshotPath: join(dir, 'snapshot.json'),
        state: {},
        throughSequence: 4,
        keepRecords: 10,
        takenAt: AT,
      }),
      'compact',
    );
    expect(result.dropped).toBe(0);
    expect(result.diagnostics.has('compaction.nothing')).toBe(true);
  });

  it('refuses a snapshot ahead of the journal', () => {
    const dir = tempDir();
    const result = compact({
      journal: journalOf(dir, 4),
      snapshotPath: join(dir, 'snapshot.json'),
      state: {},
      throughSequence: 40,
      takenAt: AT,
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('reaches 4');
  });

  it('refuses a nonsense tail', () => {
    const dir = tempDir();
    const result = compact({
      journal: journalOf(dir, 4),
      snapshotPath: join(dir, 'snapshot.json'),
      state: {},
      throughSequence: 4,
      keepRecords: -1,
      takenAt: AT,
    });
    expect(result.ok).toBe(false);
  });
});

describe('deciding whether to bother', () => {
  it('waits until the covered part is well past the tail', () => {
    const dir = tempDir();
    const journal = journalOf(dir, 40);
    expect(shouldCompact(journal, 40, 30)).toBe(false);
    expect(shouldCompact(journal, 40, 10)).toBe(true);
    expect(shouldCompact(journal, 0, 10)).toBe(false);
    expect(DEFAULT_KEEP_RECORDS).toBe(5_000);
  });
});
