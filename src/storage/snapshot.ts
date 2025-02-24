import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { err, ok, type Result } from '../util/result.js';
import { crc32 } from './journal-format.js';

/**
 * Replaying eleven weeks of journal on every start took ninety seconds by
 * February, so the store writes a snapshot and the journal only has to carry
 * what happened since.
 *
 * The manifest is separate from the payload and carries the checksum of it, so
 * a snapshot that was half written is detectable without parsing megabytes of
 * json. Both files are written to a temporary name and renamed, which on every
 * filesystem we run on is atomic, so a reader never sees a half file.
 */

export const SNAPSHOT_FORMAT_VERSION = 3;

export interface SnapshotManifest {
  readonly formatVersion: number;
  readonly takenAt: string;
  /** The journal sequence the snapshot is current as of. */
  readonly throughSequence: number;
  readonly checksum: string;
  readonly byteLength: number;
  readonly counts: Readonly<Record<string, number>>;
}

export interface Snapshot<T> {
  readonly manifest: SnapshotManifest;
  readonly state: T;
}

function manifestPath(path: string): string {
  return `${path}.manifest.json`;
}

export interface WriteSnapshotOptions {
  readonly takenAt?: Date | undefined;
  readonly counts?: Readonly<Record<string, number>> | undefined;
}

export function writeSnapshot<T>(
  path: string,
  state: T,
  throughSequence: number,
  options: WriteSnapshotOptions = {},
): SnapshotManifest {
  mkdirSync(dirname(path), { recursive: true });
  const payload = JSON.stringify(state);
  const manifest: SnapshotManifest = {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    takenAt: (options.takenAt ?? new Date()).toISOString(),
    throughSequence,
    checksum: crc32(payload),
    byteLength: payload.length,
    counts: options.counts ?? {},
  };
  const payloadTemp = `${path}.writing`;
  const manifestTemp = `${manifestPath(path)}.writing`;
  writeFileSync(payloadTemp, payload, 'utf8');
  writeFileSync(manifestTemp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  renameSync(payloadTemp, path);
  renameSync(manifestTemp, manifestPath(path));
  return manifest;
}

export function readSnapshot<T>(path: string): Result<Snapshot<T> | undefined> {
  if (!existsSync(path) || !existsSync(manifestPath(path))) return ok(undefined);
  let manifest: SnapshotManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath(path), 'utf8')) as SnapshotManifest;
  } catch {
    return err('the snapshot manifest is not json');
  }
  if (manifest.formatVersion !== SNAPSHOT_FORMAT_VERSION) {
    return err(
      `the snapshot is format ${String(manifest.formatVersion)} and this build reads ${SNAPSHOT_FORMAT_VERSION}`,
    );
  }
  const payload = readFileSync(path, 'utf8');
  if (payload.length !== manifest.byteLength) {
    return err(`the snapshot claims ${manifest.byteLength} bytes and holds ${payload.length}`);
  }
  if (crc32(payload) !== manifest.checksum) return err('the snapshot fails its checksum');
  let state: T;
  try {
    state = JSON.parse(payload) as T;
  } catch {
    return err('the snapshot payload is not json');
  }
  return ok({ manifest, state });
}

export function discardSnapshot(path: string): void {
  for (const file of [path, manifestPath(path)]) {
    if (existsSync(file)) unlinkSync(file);
  }
}

export function snapshotManifestPath(path: string): string {
  return manifestPath(path);
}
