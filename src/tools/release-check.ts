/**
 * The checks that have to pass before a build goes on the base station. Every
 * one of them is here because a release once went out without it: a version
 * that did not match the changelog, a changelog whose top entry was the
 * previous release, and a build whose command reference described a flag it
 * had dropped.
 */

export interface ReleaseInput {
  readonly packageVersion: string;
  readonly codeVersion: string;
  readonly changelog: string;
  readonly generatedCurrent: boolean;
}

export interface ReleaseProblem {
  readonly check: string;
  readonly detail: string;
}

const VERSION = /^\d+\.\d+\.\d+$/;
const HEADING = /^## \[?(\d+\.\d+\.\d+)\]?/m;

export function changelogVersions(changelog: string): string[] {
  return [...changelog.matchAll(/^## \[?(\d+\.\d+\.\d+)\]?/gm)].map((match) => match[1] ?? '');
}

export function topChangelogVersion(changelog: string): string | undefined {
  return HEADING.exec(changelog)?.[1];
}

/** The heading a version writes, with or without the square brackets. */
export function headingFor(version: string): string[] {
  return [`## ${version}`, `## [${version}]`];
}

export function entryFor(changelog: string, version: string): string | undefined {
  const lines = changelog.split('\n');
  const headings = headingFor(version);
  const at = lines.findIndex((line) => headings.some((heading) => line.startsWith(heading)));
  if (at === -1) return undefined;
  const rest = lines.slice(at + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

export function checkRelease(input: ReleaseInput): ReleaseProblem[] {
  const problems: ReleaseProblem[] = [];

  if (!VERSION.test(input.packageVersion)) {
    problems.push({ check: 'version', detail: `${input.packageVersion} is not a version` });
  }
  if (input.packageVersion !== input.codeVersion) {
    problems.push({
      check: 'version',
      detail: `the package says ${input.packageVersion} and the code says ${input.codeVersion}`,
    });
  }

  const top = topChangelogVersion(input.changelog);
  if (top === undefined) {
    problems.push({ check: 'changelog', detail: 'the changelog has no version heading' });
  } else if (top !== input.packageVersion) {
    problems.push({
      check: 'changelog',
      detail: `the changelog opens at ${top} and the package is ${input.packageVersion}`,
    });
  }

  const entry = entryFor(input.changelog, input.packageVersion);
  if (entry !== undefined && entry === '') {
    problems.push({ check: 'changelog', detail: `${input.packageVersion} has an empty entry` });
  }

  const versions = changelogVersions(input.changelog);
  if (new Set(versions).size !== versions.length) {
    problems.push({ check: 'changelog', detail: 'a version appears twice' });
  }

  if (!input.generatedCurrent) {
    problems.push({ check: 'docs', detail: 'the generated pages are out of date' });
  }

  return problems;
}

export function releaseReady(input: ReleaseInput): boolean {
  return checkRelease(input).length === 0;
}
