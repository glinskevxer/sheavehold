import { readFileSync } from 'node:fs';
import { sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  importedLayers,
  layerOf,
  LAYERS,
  mayImport,
  normalise,
  verifyTree,
  walk,
} from '../../../src/tools/verify-tree.js';

const read = (path: string): string => {
  if (path.endsWith('upward.ts')) return "import { thing } from '../service/query.js';";
  if (path.endsWith('sideways.ts')) return "import { thing } from '../lift/lift.js';";
  return "import { ok } from '../../util/result.js';";
};

describe('the layer order', () => {
  it('lists the layers from the bottom up', () => {
    expect(LAYERS[0]).toBe('util');
    expect(LAYERS.at(-1)).toBe('cli');
  });

  it('lets a layer import downward and from itself', () => {
    expect(mayImport('service', 'domain')).toBe(true);
    expect(mayImport('domain', 'util')).toBe(true);
    expect(mayImport('cli', 'cli')).toBe(true);
  });

  it('refuses an import going upward', () => {
    expect(mayImport('domain', 'service')).toBe(false);
    expect(mayImport('util', 'domain')).toBe(false);
  });

  it('allows anything involving a directory that is not a layer', () => {
    expect(mayImport('tools', 'domain')).toBe(true);
    expect(mayImport('domain', 'tools')).toBe(true);
  });
});

describe('reading a file', () => {
  it('normalises a windows path to slashes', () => {
    expect(normalise(['cli', 'commands', 'day.ts'].join(sep))).toBe('cli/commands/day.ts');
    expect(normalise('cli/commands/day.ts')).toBe('cli/commands/day.ts');
  });

  it('names the layer a path is in', () => {
    expect(layerOf('src/domain/lift/lift.ts')).toBe('domain');
    expect(layerOf('src/index.ts')).toBe('index.ts');
  });

  it('finds the layers a source file imports from', () => {
    expect(
      importedLayers("import { a } from '../../util/result.js';", 'src/domain/lift/lift.ts'),
    ).toEqual(['util']);
  });

  it('ignores an import of a package', () => {
    expect(importedLayers("import { z } from 'zod';", 'src/domain/lift/lift.ts')).toEqual([]);
  });

  it('ignores an import inside the same layer', () => {
    expect(
      importedLayers("import { a } from '../lift/lift.js';", 'src/domain/ride/ride.ts'),
    ).toEqual([]);
  });
});

describe('verifying a tree', () => {
  it('passes a tree where everything is tested and points downward', () => {
    expect(
      verifyTree({
        sourceFiles: ['src/domain/lift/lift.ts'],
        testFiles: ['tests/unit/domain/lift/lift.test.ts'],
        read,
      }),
    ).toEqual([]);
  });

  it('finds a module with no test', () => {
    expect(verifyTree({ sourceFiles: ['src/domain/lift/lift.ts'], testFiles: [], read })).toEqual([
      { path: 'domain/lift/lift.ts', problem: 'has no test under tests/unit' },
    ]);
  });

  it('lets a module be exempt from needing a test', () => {
    expect(
      verifyTree({
        sourceFiles: ['src/index.ts'],
        testFiles: [],
        read,
        exempt: ['index.ts'],
      }),
    ).toEqual([]);
  });

  it('finds an import going upward', () => {
    const problems = verifyTree({
      sourceFiles: ['src/domain/lift/upward.ts'],
      testFiles: ['tests/unit/domain/lift/upward.test.ts'],
      read,
    });
    expect(problems).toEqual([
      { path: 'domain/lift/upward.ts', problem: 'imports upward into service' },
    ]);
  });

  it('finds a test living under src', () => {
    const problems = verifyTree({
      sourceFiles: ['src/domain/lift/lift.test.ts'],
      testFiles: [],
      read,
      exempt: ['domain/lift/lift.test.ts'],
    });
    expect(problems).toEqual([
      { path: 'domain/lift/lift.test.ts', problem: 'is a test living under src' },
    ]);
  });
});

describe('walking a directory', () => {
  it('finds the source files under src', () => {
    const found = walk('src');
    expect(found.length).toBeGreaterThan(40);
    expect(found.every((path) => path.endsWith('.ts'))).toBe(true);
  });
});

describe('the real tree', () => {
  it('is the shape the suite assumes', () => {
    const problems = verifyTree({
      sourceFiles: walk('src'),
      testFiles: walk('tests/unit'),
      read: (path) => readFileSync(path, 'utf8'),
      exempt: ['index.ts', 'cli/app.ts', 'cli/entry.ts', 'storage/schema/state.ts'],
    });
    expect(problems).toEqual([]);
  });
});
