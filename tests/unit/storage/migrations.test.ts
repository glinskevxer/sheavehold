import { describe, expect, it } from 'vitest';
import {
  checkMigrations,
  emptyState,
  latestVersion,
  migrate,
  pendingMigrations,
  type Migration,
  type PersistedState,
} from '../../../src/storage/migrations.js';
import { expect as expectOk, isErr } from '../../../src/util/result.js';

const one: Migration = {
  id: 1,
  name: 'add the ride table',
  up: (state) => ({ ...state, rides: [] }),
};

const two: Migration = {
  id: 2,
  name: 'add the exception table',
  up: (state) => ({ ...state, exceptions: [] }),
};

const three: Migration = {
  id: 3,
  name: 'name the visits',
  up: (state) => ({ ...state, visits: [], named: true }),
};

const all = [one, two, three];

describe('checking a set of migrations', () => {
  it('sorts them and passes a clean set', () => {
    const checked = expectOk(checkMigrations([three, one, two]), 'migrations');
    expect(checked.map((migration) => migration.id)).toEqual([1, 2, 3]);
  });

  it('refuses two with the same number', () => {
    expect(isErr(checkMigrations([one, { ...two, id: 1 }]))).toBe(true);
  });

  it('refuses a number below one or a fraction', () => {
    expect(isErr(checkMigrations([{ ...one, id: 0 }]))).toBe(true);
    expect(isErr(checkMigrations([{ ...one, id: 1.5 }]))).toBe(true);
  });

  it('refuses one with no name', () => {
    expect(isErr(checkMigrations([{ ...one, name: '  ' }]))).toBe(true);
  });

  it('reads the latest version off the set', () => {
    expect(latestVersion(all)).toBe(3);
    expect(latestVersion([])).toBe(0);
  });

  it('lists what is still to run', () => {
    expect(pendingMigrations(all, 1).map((migration) => migration.id)).toEqual([2, 3]);
    expect(pendingMigrations(all, 3)).toEqual([]);
    expect(pendingMigrations(all, 0)).toHaveLength(3);
  });
});

describe('migrating a store', () => {
  it('walks a fresh store up to the latest', () => {
    const outcome = expectOk(migrate({ schemaVersion: 0 }, all), 'migrate');
    expect(outcome.fromVersion).toBe(0);
    expect(outcome.toVersion).toBe(3);
    expect(outcome.applied.map((migration) => migration.id)).toEqual([1, 2, 3]);
    expect(outcome.state).toMatchObject({ rides: [], exceptions: [], named: true });
  });

  it('runs only what is pending', () => {
    const outcome = expectOk(migrate({ schemaVersion: 2 }, all), 'migrate');
    expect(outcome.applied.map((migration) => migration.id)).toEqual([3]);
    expect(outcome.state.exceptions).toBeUndefined();
  });

  it('does nothing to a store already at the latest', () => {
    const outcome = expectOk(migrate({ schemaVersion: 3 }, all), 'migrate');
    expect(outcome.applied).toEqual([]);
    expect(outcome.diagnostics.has('migration.none')).toBe(true);
  });

  it('notes each migration it applied', () => {
    const outcome = expectOk(migrate({ schemaVersion: 0 }, all), 'migrate');
    expect(outcome.diagnostics.bySeverity('info')).toHaveLength(3);
    expect(outcome.diagnostics.all()[0]?.message).toBe('1 add the ride table');
  });

  it('refuses a store written by a newer build', () => {
    const outcome = migrate({ schemaVersion: 9 }, all);
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error).toContain('knows up to 3');
  });

  it('treats a missing version as zero', () => {
    const state = { rides: [] } as unknown as PersistedState;
    expect(expectOk(migrate(state, all), 'migrate').toVersion).toBe(3);
  });

  it('stops and names the migration that threw', () => {
    const broken: Migration = {
      id: 2,
      name: 'break',
      up: () => {
        throw new Error('no room on the disk');
      },
    };
    const outcome = migrate({ schemaVersion: 0 }, [one, broken]);
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error).toContain('2 break failed');
  });

  it('leaves the caller state alone', () => {
    const state: PersistedState = { schemaVersion: 0 };
    migrate(state, all);
    expect(state).toEqual({ schemaVersion: 0 });
  });

  it('passes the checks straight through', () => {
    expect(isErr(migrate({ schemaVersion: 0 }, [one, { ...two, id: 1 }]))).toBe(true);
  });
});

describe('a fresh store', () => {
  it('starts at the latest schema rather than at zero', () => {
    expect(emptyState(all)).toEqual({ schemaVersion: 3 });
    expect(emptyState([])).toEqual({ schemaVersion: 0 });
  });
});
