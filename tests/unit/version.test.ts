import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILD, canRead, describeBuild, parseVersion, VERSION } from '../../src/version.js';
import { REPORT_WIRE_VERSION } from '../../src/report/json.js';

describe('the version', () => {
  it('is a semantic version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parseVersion(VERSION)).toEqual({ major: 1, minor: 0, patch: 0 });
  });

  it('is the same as the one in the package', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(packageJson.version).toBe(VERSION);
  });

  it('refuses anything that is not a version', () => {
    expect(parseVersion('next')).toBeUndefined();
    expect(parseVersion('1.0')).toBeUndefined();
    expect(parseVersion(' 1.0.0 ')).toEqual({ major: 1, minor: 0, patch: 0 });
  });
});

describe('the build', () => {
  it('names itself and carries the two format numbers', () => {
    expect(BUILD.name).toBe('sheavehold');
    expect(BUILD.version).toBe(VERSION);
    expect(BUILD.wireVersion).toBe(REPORT_WIRE_VERSION);
    expect(BUILD.storeSchema).toBe(2);
  });

  it('describes itself in one line', () => {
    expect(describeBuild()).toBe('sheavehold 1.0.0, wire 2, store schema 2');
  });
});

describe('reading an older store', () => {
  it('reads its own schema and anything before it', () => {
    expect(canRead(BUILD.storeSchema)).toBe(true);
    expect(canRead(1)).toBe(true);
  });

  it('refuses a store from a newer build', () => {
    expect(canRead(BUILD.storeSchema + 1)).toBe(false);
  });
});
