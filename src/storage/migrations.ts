import { DiagnosticBag } from '../util/diagnostic.js';
import { err, ok, type Result } from '../util/result.js';

/**
 * The store is a file on a box in an unheated room and it gets upgraded in
 * place, so the shape of what is on disk has to be able to move forward.
 *
 * A migration is a pure function over the persisted state. It never touches the
 * journal records themselves, only the snapshot payload, because a journal
 * record is what actually happened and rewriting history to suit a new field is
 * how you end up with a season report nobody can reproduce.
 */

export interface PersistedState {
  schemaVersion: number;
  [key: string]: unknown;
}

export interface Migration {
  /** Applied in ascending order. Never reused, never renumbered. */
  readonly id: number;
  readonly name: string;
  readonly up: (state: PersistedState) => PersistedState;
}

export interface MigrationOutcome {
  readonly state: PersistedState;
  readonly applied: readonly Migration[];
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly diagnostics: DiagnosticBag;
}

export function checkMigrations(migrations: readonly Migration[]): Result<readonly Migration[]> {
  const sorted = [...migrations].sort((a, b) => a.id - b.id);
  const seen = new Set<number>();
  for (const migration of sorted) {
    if (!Number.isInteger(migration.id) || migration.id < 1) {
      return err(`migration ${migration.name} is numbered ${migration.id}`);
    }
    if (seen.has(migration.id)) return err(`two migrations are numbered ${migration.id}`);
    if (migration.name.trim() === '') return err(`migration ${migration.id} has no name`);
    seen.add(migration.id);
  }
  return ok(sorted);
}

export function latestVersion(migrations: readonly Migration[]): number {
  return migrations.reduce((highest, migration) => Math.max(highest, migration.id), 0);
}

export function pendingMigrations(
  migrations: readonly Migration[],
  fromVersion: number,
): Migration[] {
  return [...migrations]
    .sort((a, b) => a.id - b.id)
    .filter((migration) => migration.id > fromVersion);
}

/**
 * Runs every migration above the state's own version. A state written by a
 * newer build is refused rather than downgraded, because there is no way to
 * know what the newer build put in it.
 */
export function migrate(
  state: PersistedState,
  migrations: readonly Migration[],
): Result<MigrationOutcome> {
  const checked = checkMigrations(migrations);
  if (!checked.ok) return checked;

  const fromVersion = Number.isInteger(state.schemaVersion) ? state.schemaVersion : 0;
  const target = latestVersion(checked.value);
  if (fromVersion > target) {
    return err(`the store is at schema ${fromVersion} and this build knows up to ${target}`);
  }

  const diagnostics = new DiagnosticBag();
  const applied: Migration[] = [];
  let current = state;

  for (const migration of pendingMigrations(checked.value, fromVersion)) {
    let next: PersistedState;
    try {
      next = migration.up({ ...current });
    } catch (cause) {
      return err(`migration ${migration.id} ${migration.name} failed: ${String(cause)}`);
    }
    next.schemaVersion = migration.id;
    current = next;
    applied.push(migration);
    diagnostics.info('migration.applied', `${migration.id} ${migration.name}`, {
      migration: migration.id,
    });
  }

  if (applied.length === 0) {
    diagnostics.info('migration.none', `the store is already at schema ${fromVersion}`);
  }

  return ok({
    state: current,
    applied,
    fromVersion,
    toVersion: current.schemaVersion,
    diagnostics,
  });
}

/** A fresh store is written at the latest schema, never migrated up from zero. */
export function emptyState(migrations: readonly Migration[]): PersistedState {
  return { schemaVersion: latestVersion(migrations) };
}
