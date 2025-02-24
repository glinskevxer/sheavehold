import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  discardSnapshot,
  readSnapshot,
  snapshotManifestPath,
  SNAPSHOT_FORMAT_VERSION,
  writeSnapshot,
} from '../../../src/storage/snapshot.js';
import { expect as expectOk, isErr } from '../../../src/util/result.js';
import { tempDir, tempPath } from '../../support/tempdir.js';

const AT = new Date('2025-01-13T23:55:00Z');
const state = { rides: [{ id: 'R-1', lift: 'SUNB' }], visits: 4 };

describe('writing a snapshot', () => {
  it('writes the payload and a manifest beside it', () => {
    const path = tempPath('snapshot.json');
    const manifest = writeSnapshot(path, state, 412, { takenAt: AT, counts: { rides: 1 } });
    expect(existsSync(path)).toBe(true);
    expect(existsSync(snapshotManifestPath(path))).toBe(true);
    expect(manifest).toMatchObject({
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      takenAt: '2025-01-13T23:55:00.000Z',
      throughSequence: 412,
      counts: { rides: 1 },
    });
  });

  it('makes the directory under it', () => {
    const path = join(tempDir(), 'deep', 'store', 'snapshot.json');
    writeSnapshot(path, state, 1, { takenAt: AT });
    expect(existsSync(path)).toBe(true);
  });

  it('leaves no temporary files behind', () => {
    const path = tempPath('snapshot.json');
    writeSnapshot(path, state, 1, { takenAt: AT });
    expect(existsSync(`${path}.writing`)).toBe(false);
    expect(existsSync(`${snapshotManifestPath(path)}.writing`)).toBe(false);
  });

  it('stamps now when nobody said', () => {
    const path = tempPath('snapshot.json');
    const before = Date.now();
    const manifest = writeSnapshot(path, state, 1);
    expect(new Date(manifest.takenAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(manifest.counts).toEqual({});
  });
});

describe('reading a snapshot', () => {
  it('round trips the state', () => {
    const path = tempPath('snapshot.json');
    writeSnapshot(path, state, 412, { takenAt: AT });
    const read = expectOk(readSnapshot<typeof state>(path), 'snapshot');
    expect(read?.state).toEqual(state);
    expect(read?.manifest.throughSequence).toBe(412);
  });

  it('answers nothing when there is no snapshot', () => {
    expect(expectOk(readSnapshot(tempPath('nothing.json')), 'snapshot')).toBeUndefined();
  });

  it('answers nothing when the manifest is missing', () => {
    const path = tempPath('snapshot.json');
    writeSnapshot(path, state, 1, { takenAt: AT });
    discardSnapshot(path);
    writeFileSync(path, '{}', 'utf8');
    expect(expectOk(readSnapshot(path), 'snapshot')).toBeUndefined();
  });

  it('refuses a payload that does not match its checksum', () => {
    const path = tempPath('snapshot.json');
    writeSnapshot(path, state, 1, { takenAt: AT });
    const payload = readFileSync(path, 'utf8');
    writeFileSync(path, payload.replace('SUNB', 'BOWL'), 'utf8');
    const read = readSnapshot(path);
    expect(read.ok).toBe(false);
    expect(!read.ok && read.error).toContain('checksum');
  });

  it('refuses a payload of the wrong length', () => {
    const path = tempPath('snapshot.json');
    writeSnapshot(path, state, 1, { takenAt: AT });
    writeFileSync(path, `${readFileSync(path, 'utf8')} `, 'utf8');
    const read = readSnapshot(path);
    expect(!read.ok && read.error).toContain('bytes');
  });

  it('refuses a snapshot written by an older build', () => {
    const path = tempPath('snapshot.json');
    writeSnapshot(path, state, 1, { takenAt: AT });
    const manifest = JSON.parse(readFileSync(snapshotManifestPath(path), 'utf8')) as {
      formatVersion: number;
    };
    manifest.formatVersion = 1;
    writeFileSync(snapshotManifestPath(path), JSON.stringify(manifest), 'utf8');
    const read = readSnapshot(path);
    expect(!read.ok && read.error).toContain('format 1');
  });

  it('refuses a manifest that is not json', () => {
    const path = tempPath('snapshot.json');
    writeSnapshot(path, state, 1, { takenAt: AT });
    writeFileSync(snapshotManifestPath(path), 'not json', 'utf8');
    expect(isErr(readSnapshot(path))).toBe(true);
  });
});

describe('throwing a snapshot away', () => {
  it('takes both files and does not mind if they are gone', () => {
    const path = tempPath('snapshot.json');
    writeSnapshot(path, state, 1, { takenAt: AT });
    discardSnapshot(path);
    expect(existsSync(path)).toBe(false);
    expect(existsSync(snapshotManifestPath(path))).toBe(false);
    expect(() => discardSnapshot(path)).not.toThrow();
  });
});
