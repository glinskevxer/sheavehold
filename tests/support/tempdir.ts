import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';

const made: string[] = [];

/** A directory that lives for one test and is taken away afterwards. */
export function tempDir(prefix = 'sheavehold-'): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  made.push(path);
  return path;
}

export function tempPath(name: string): string {
  return join(tempDir(), name);
}

afterEach(() => {
  while (made.length > 0) {
    const path = made.pop();
    if (path === undefined) continue;
    rmSync(path, { recursive: true, force: true });
  }
});
