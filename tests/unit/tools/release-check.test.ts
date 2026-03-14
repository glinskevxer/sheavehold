import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  changelogVersions,
  checkRelease,
  entryFor,
  headingFor,
  releaseReady,
  topChangelogVersion,
  type ReleaseInput,
} from '../../../src/tools/release-check.js';
import { VERSION } from '../../../src/version.js';

const CHANGELOG = `# changelog

## 0.9.0

- something

## 0.5.0

- something earlier
`;

const good: ReleaseInput = {
  packageVersion: '0.9.0',
  codeVersion: '0.9.0',
  changelog: CHANGELOG,
  generatedCurrent: true,
};

describe('reading a changelog', () => {
  it('lists the versions in it, newest first', () => {
    expect(changelogVersions(CHANGELOG)).toEqual(['0.9.0', '0.5.0']);
  });

  it('names the top version', () => {
    expect(topChangelogVersion(CHANGELOG)).toBe('0.9.0');
    expect(topChangelogVersion('# changelog\n')).toBeUndefined();
  });

  it('pulls one entry out', () => {
    expect(entryFor(CHANGELOG, '0.9.0')).toBe('- something');
    expect(entryFor(CHANGELOG, '0.5.0')).toBe('- something earlier');
    expect(entryFor(CHANGELOG, '0.1.0')).toBeUndefined();
  });

  it('takes a heading with or without brackets', () => {
    expect(headingFor('1.2.3')).toEqual(['## 1.2.3', '## [1.2.3]']);
    expect(entryFor(['## [0.9.0]', '', '- bracketed', ''].join('\n'), '0.9.0')).toBe('- bracketed');
  });

  it('does not let one version match another', () => {
    expect(entryFor(CHANGELOG, '0.5.0')).not.toBe(entryFor(CHANGELOG, '0.9.0'));
  });
});

describe('the release checks', () => {
  it('passes a release that is ready', () => {
    expect(checkRelease(good)).toEqual([]);
    expect(releaseReady(good)).toBe(true);
  });

  it('catches a version that is not a version', () => {
    const problems = checkRelease({ ...good, packageVersion: 'next' });
    expect(problems.some((problem) => problem.check === 'version')).toBe(true);
  });

  it('catches the package and the code disagreeing', () => {
    const problems = checkRelease({ ...good, codeVersion: '0.8.0' });
    expect(problems[0]?.detail).toContain('the code says 0.8.0');
  });

  it('catches a changelog that has not been opened for this release', () => {
    const problems = checkRelease({ ...good, packageVersion: '1.0.0', codeVersion: '1.0.0' });
    expect(problems.some((problem) => problem.check === 'changelog')).toBe(true);
  });

  it('catches a changelog with no headings at all', () => {
    const problems = checkRelease({ ...good, changelog: '# changelog\n' });
    expect(problems[0]?.detail).toContain('no version heading');
  });

  it('catches an entry nobody wrote anything under', () => {
    const empty = '# changelog\n\n## 0.9.0\n\n## 0.5.0\n\n- earlier\n';
    const problems = checkRelease({ ...good, changelog: empty });
    expect(problems.some((problem) => problem.detail.includes('empty entry'))).toBe(true);
  });

  it('catches a version listed twice', () => {
    const twice = `${CHANGELOG}\n## 0.9.0\n\n- again\n`;
    expect(
      checkRelease({ ...good, changelog: twice }).some((p) => p.detail.includes('twice')),
    ).toBe(true);
  });

  it('catches generated pages that are out of date', () => {
    const problems = checkRelease({ ...good, generatedCurrent: false });
    expect(problems.some((problem) => problem.check === 'docs')).toBe(true);
  });
});

describe('this build', () => {
  it('is ready to release', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(
      checkRelease({
        packageVersion: packageJson.version,
        codeVersion: VERSION,
        changelog: readFileSync('CHANGELOG.md', 'utf8'),
        generatedCurrent: true,
      }),
    ).toEqual([]);
  });
});
