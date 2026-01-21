import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * The suite assumes a shape: every module under `src` has a test beside it in
 * `tests/unit`, tests live only under `tests`, and the layers only depend
 * downward. None of that is enforced by the compiler, and all three had drifted
 * by February: two modules had no test at all, one test sat in `src`, and the
 * domain had started importing from the service layer.
 */

export const LAYERS = ['util', 'domain', 'ingest', 'storage', 'service', 'report', 'api', 'cli'];

/** A layer may import from itself and anything earlier in this list. */
export function mayImport(from: string, to: string): boolean {
  const fromAt = LAYERS.indexOf(from);
  const toAt = LAYERS.indexOf(to);
  if (fromAt === -1 || toAt === -1) return true;
  return toAt <= fromAt;
}

export function walk(root: string, suffix = '.ts'): string[] {
  const out: string[] = [];
  const visit = (path: string): void => {
    for (const entry of readdirSync(path)) {
      const full = join(path, entry);
      if (statSync(full).isDirectory()) {
        visit(full);
        continue;
      }
      if (full.endsWith(suffix)) out.push(full);
    }
  };
  visit(root);
  return out;
}

/** Windows hands back backslashes, and the exempt list is written with slashes. */
export function normalise(path: string): string {
  return path.split(sep).join('/');
}

export function layerOf(path: string): string | undefined {
  return normalise(relative('src', path)).split('/')[0];
}

const IMPORT = /from '([^']+)'/g;

export function importedLayers(source: string, path: string): string[] {
  const own = layerOf(path);
  const found = new Set<string>();
  for (const match of source.matchAll(IMPORT)) {
    const target = match[1] ?? '';
    if (!target.startsWith('.')) continue;
    const parts = target.split('/');
    for (const part of parts) {
      if (LAYERS.includes(part) && part !== own) found.add(part);
    }
  }
  return [...found].sort();
}

export interface TreeProblem {
  readonly path: string;
  readonly problem: string;
}

export interface TreeInput {
  readonly sourceFiles: readonly string[];
  readonly testFiles: readonly string[];
  readonly read: (path: string) => string;
  /** Modules that are wiring and have no rules of their own to test. */
  readonly exempt?: readonly string[] | undefined;
}

export function verifyTree(input: TreeInput): TreeProblem[] {
  const problems: TreeProblem[] = [];
  const exempt = new Set(input.exempt ?? []);

  const tested = new Set(
    input.testFiles.map((path) =>
      normalise(relative(join('tests', 'unit'), path)).replace(/\.test\.ts$/, '.ts'),
    ),
  );

  for (const path of input.sourceFiles) {
    const key = normalise(relative('src', path));
    if (!exempt.has(key) && !tested.has(key)) {
      problems.push({ path: key, problem: 'has no test under tests/unit' });
    }
    const own = layerOf(path);
    if (own === undefined) continue;
    for (const target of importedLayers(input.read(path), path)) {
      if (!mayImport(own, target)) {
        problems.push({ path: key, problem: `imports upward into ${target}` });
      }
    }
  }

  for (const path of input.sourceFiles) {
    if (path.endsWith('.test.ts')) {
      problems.push({
        path: normalise(relative('src', path)),
        problem: 'is a test living under src',
      });
    }
  }

  return problems.sort(
    (a, b) => a.path.localeCompare(b.path) || a.problem.localeCompare(b.problem),
  );
}
