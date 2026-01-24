import { readFileSync, writeFileSync } from 'node:fs';
import { buildRouter } from '../src/api/build.js';
import { renderApiReference } from '../src/api/reference.js';
import { emptyApp } from '../src/cli/entry.js';

/**
 * Writes `docs/api.md` off the assembled router. With `--check` it compares
 * instead, which is what the docs job runs.
 */

const PATH = 'docs/api.md';

const wanted = renderApiReference(
  buildRouter({ app: emptyApp(), asOf: '2025-01-13', seasonOpensOn: '2024-11-22' }),
);

if (process.argv.includes('--check')) {
  let found = '';
  try {
    found = readFileSync(PATH, 'utf8');
  } catch {
    found = '';
  }
  if (found !== wanted) {
    process.stderr.write(`${PATH} is out of date, run npm run api-docs\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`${PATH} is current\n`);
  }
} else {
  writeFileSync(PATH, wanted, 'utf8');
  process.stdout.write(`wrote ${PATH}\n`);
}
