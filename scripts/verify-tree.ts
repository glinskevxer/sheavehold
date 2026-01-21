import { readFileSync } from 'node:fs';
import { verifyTree, walk } from '../src/tools/verify-tree.js';

/**
 * Run by the lint job. Prints nothing and exits zero when the tree is the shape
 * the suite assumes, and prints one line per problem otherwise.
 */

const EXEMPT = ['index.ts', 'cli/app.ts', 'cli/entry.ts', 'storage/schema/state.ts'];

const problems = verifyTree({
  sourceFiles: walk('src'),
  testFiles: walk('tests/unit'),
  read: (path) => readFileSync(path, 'utf8'),
  exempt: EXEMPT,
});

for (const problem of problems) {
  process.stderr.write(`${problem.path} ${problem.problem}\n`);
}
process.stdout.write(`${problems.length} problems in the tree\n`);
process.exitCode = problems.length === 0 ? 0 : 1;
