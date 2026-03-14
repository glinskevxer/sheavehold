/**
 * One place the version is written down. It used to live in `cli/main.ts`,
 * which meant the api had no way to report it without importing the command
 * line, and the release check compared the package against a constant that
 * three other files had their own copies of.
 *
 * The package version is checked against this on every release, so the two
 * cannot drift.
 */

export const VERSION = '1.0.0';

export interface BuildInfo {
  readonly name: string;
  readonly version: string;
  readonly wireVersion: number;
  readonly storeSchema: number;
}

export const BUILD: BuildInfo = {
  name: 'sheavehold',
  version: VERSION,
  wireVersion: 2,
  storeSchema: 2,
};

export function describeBuild(): string {
  return `${BUILD.name} ${BUILD.version}, wire ${BUILD.wireVersion}, store schema ${BUILD.storeSchema}`;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(
  raw: string,
): { major: number; minor: number; patch: number } | undefined {
  const match = SEMVER.exec(raw.trim());
  if (match === null) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/** True when a store written by `other` can be read by this build. */
export function canRead(otherSchema: number): boolean {
  return otherSchema <= BUILD.storeSchema;
}
