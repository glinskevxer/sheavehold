import { readFileSync, writeFileSync } from 'node:fs';
import { buildProgram } from '../src/cli/main.js';
import { CollectedOutput } from '../src/cli/output.js';
import { BUILDERS, emptyApp } from '../src/cli/entry.js';
import { renderCommandReference, undocumented } from '../src/tools/command-reference.js';

/**
 * Writes `docs/commands.md`. With `--check` it compares instead of writing,
 * which is what the docs job runs so a pull request that adds a flag has to
 * carry the regenerated page with it.
 */

const PATH = 'docs/commands.md';

const program = buildProgram({
  app: emptyApp(),
  output: new CollectedOutput(),
  builders: BUILDERS,
});

const missing = undocumented(program);
for (const path of missing) {
  process.stderr.write(`${path} has no description\n`);
}

const wanted = renderCommandReference(program);

if (process.argv.includes('--check')) {
  let found = '';
  try {
    found = readFileSync(PATH, 'utf8');
  } catch {
    found = '';
  }
  if (found !== wanted) {
    process.stderr.write(`${PATH} is out of date, run npm run commands\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`${PATH} is current\n`);
  }
} else {
  writeFileSync(PATH, wanted, 'utf8');
  process.stdout.write(`wrote ${PATH}\n`);
}

if (missing.length > 0) process.exitCode = 1;
