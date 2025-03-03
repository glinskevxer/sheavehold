import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Journal } from '../../../src/storage/journal.js';
import { replay, unhandledKinds, type ReplayHandlers } from '../../../src/storage/replay.js';
import { writeSnapshot } from '../../../src/storage/snapshot.js';
import { expect as expectOk } from '../../../src/util/result.js';
import { tempDir } from '../../support/tempdir.js';

const AT = new Date('2025-01-13T23:40:00Z');

interface Counter {
  rides: number;
  visits: number;
}

const handlers: ReplayHandlers<Counter> = {
  initial: () => ({ rides: 0, visits: 0 }),
  handlers: {
    'ride.built': (state) => ({ ...state, rides: state.rides + 1 }),
    'visit.built': (state) => ({ ...state, visits: state.visits + 1 }),
  },
  ignored: ['snapshot.taken'],
};

function loaded(dir: string, kinds: readonly string[]): Journal {
  const journal = Journal.open(join(dir, 'journal.log')).journal;
  journal.appendAll(kinds.map((kind) => ({ kind, body: {}, at: AT })));
  return journal;
}

describe('replaying from nothing', () => {
  it('folds every record into the initial state', () => {
    const dir = tempDir();
    const journal = loaded(dir, ['ride.built', 'ride.built', 'visit.built']);
    const result = expectOk(replay({ ...handlers, journal }), 'replay');
    expect(result.state).toEqual({ rides: 2, visits: 1 });
    expect(result.applied).toBe(3);
    expect(result.fromSnapshot).toBe(false);
    expect(result.snapshot).toBeUndefined();
  });

  it('skips the kinds it knows to ignore', () => {
    const dir = tempDir();
    const journal = loaded(dir, ['ride.built', 'snapshot.taken', 'ride.built']);
    const result = expectOk(replay({ ...handlers, journal }), 'replay');
    expect(result.state.rides).toBe(2);
    expect(result.skipped).toBe(1);
  });

  it('gives the initial state for an empty journal', () => {
    const journal = loaded(tempDir(), []);
    expect(expectOk(replay({ ...handlers, journal }), 'replay').state).toEqual({
      rides: 0,
      visits: 0,
    });
  });
});

describe('replaying onto a snapshot', () => {
  it('starts from the snapshot and applies only what came after', () => {
    const dir = tempDir();
    const journal = loaded(dir, ['ride.built', 'ride.built', 'visit.built', 'ride.built']);
    const snapshotPath = join(dir, 'snapshot.json');
    writeSnapshot(snapshotPath, { rides: 2, visits: 0 }, 2, { takenAt: AT });

    const result = expectOk(replay({ ...handlers, journal, snapshotPath }), 'replay');
    expect(result.state).toEqual({ rides: 3, visits: 1 });
    expect(result.applied).toBe(2);
    expect(result.fromSnapshot).toBe(true);
    expect(result.snapshot?.throughSequence).toBe(2);
  });

  it('replays everything when there is no snapshot file', () => {
    const dir = tempDir();
    const journal = loaded(dir, ['ride.built']);
    const result = expectOk(
      replay({ ...handlers, journal, snapshotPath: join(dir, 'missing.json') }),
      'replay',
    );
    expect(result.fromSnapshot).toBe(false);
    expect(result.applied).toBe(1);
  });

  it('refuses a snapshot that is ahead of the journal', () => {
    const dir = tempDir();
    const journal = loaded(dir, ['ride.built']);
    const snapshotPath = join(dir, 'snapshot.json');
    writeSnapshot(snapshotPath, { rides: 9, visits: 9 }, 40, { takenAt: AT });
    const result = replay({ ...handlers, journal, snapshotPath });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('only reaches 1');
  });

  it('passes a broken snapshot straight back', () => {
    const dir = tempDir();
    const journal = loaded(dir, ['ride.built']);
    const snapshotPath = join(dir, 'snapshot.json');
    writeSnapshot(snapshotPath, { rides: 1, visits: 0 }, 1, { takenAt: AT });
    writeFileSync(snapshotPath, `${readFileSync(snapshotPath, 'utf8')} `, 'utf8');
    expect(replay({ ...handlers, journal, snapshotPath }).ok).toBe(false);
  });
});

describe('a record this build does not know', () => {
  it('stops rather than quietly dropping it', () => {
    const journal = loaded(tempDir(), ['ride.built', 'lift.hold.opened']);
    const result = replay({ ...handlers, journal });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('lift.hold.opened');
  });

  it('carries on with a complaint when told to', () => {
    const journal = loaded(tempDir(), ['ride.built', 'lift.hold.opened', 'ride.built']);
    const result = expectOk(replay({ ...handlers, journal, tolerateUnknown: true }), 'replay');
    expect(result.state.rides).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.diagnostics.has('replay.unknown_kind')).toBe(true);
  });

  it('lists what a journal holds that this build cannot replay', () => {
    const journal = loaded(tempDir(), ['ride.built', 'lift.hold.opened', 'weather.recorded']);
    expect(unhandledKinds(journal, handlers)).toEqual(['lift.hold.opened', 'weather.recorded']);
    expect(unhandledKinds(loaded(tempDir(), ['ride.built']), handlers)).toEqual([]);
  });
});
