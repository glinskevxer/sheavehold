import { readFileSync } from 'node:fs';
import { checkRelease } from '../src/tools/release-check.js';
import { VERSION } from '../src/cli/main.js';

/**
 * Run before a build is copied onto a base station. Everything it checks is
 * cheap and every one of them has caught a real release.
 */

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

let generatedCurrent = true;
try {
  readFileSync('docs/commands.md', 'utf8');
  readFileSync('docs/api.md', 'utf8');
} catch {
  generatedCurrent = false;
}

const problems = checkRelease({
  packageVersion: packageJson.version,
  codeVersion: VERSION,
  changelog: readFileSync('CHANGELOG.md', 'utf8'),
  generatedCurrent,
});

for (const problem of problems) {
  process.stderr.write(`${problem.check}: ${problem.detail}\n`);
}
process.stdout.write(`${problems.length} problems before release\n`);
process.exitCode = problems.length === 0 ? 0 : 1;
