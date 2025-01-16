/**
 * The same four loops were written out by hand in six modules: group by a key,
 * count by a key, take the distinct values of a field, and filter to an
 * operating day. Two of the copies had drifted, one preserving input order and
 * one not, which showed up as a report whose lift column changed order between
 * the text and the csv renderer.
 *
 * So they live here once, and the modules that used to spell them out call
 * these. Nothing here knows anything about the mountain.
 */

export function groupBy<T, K>(items: Iterable<T>, keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [item]);
    else bucket.push(item);
  }
  return groups;
}

export function tallyBy<T, K>(
  items: Iterable<T>,
  keyOf: (item: T) => K | undefined,
): Map<K, number> {
  const counts = new Map<K, number>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === undefined) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Distinct values in first appearance order, which is what callers assumed. */
export function distinct<T, K>(items: Iterable<T>, keyOf: (item: T) => K): K[] {
  const seen = new Set<K>();
  const out: K[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function sumBy<T>(items: Iterable<T>, valueOf: (item: T) => number): number {
  let total = 0;
  for (const item of items) total += valueOf(item);
  return total;
}

/** Sorted distinct values, which is what the report columns want. */
export function distinctSorted<T>(items: Iterable<T>, keyOf: (item: T) => string): string[] {
  return distinct(items, keyOf).sort();
}

export function maxBy<T>(items: Iterable<T>, valueOf: (item: T) => number): T | undefined {
  let best: T | undefined;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const value = valueOf(item);
    if (value > bestValue) {
      best = item;
      bestValue = value;
    }
  }
  return best;
}

export function partitionBy<T>(
  items: Iterable<T>,
  predicate: (item: T) => boolean,
): { matched: T[]; rest: T[] } {
  const matched: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    if (predicate(item)) matched.push(item);
    else rest.push(item);
  }
  return { matched, rest };
}
