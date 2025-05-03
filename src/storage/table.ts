import { SheaveholdError } from '../util/diagnostic.js';

/**
 * The store keeps everything in memory. A whole season is about two million
 * rides, which is well inside what the base station has, and it means every
 * report is a walk over an array rather than a query somebody has to tune.
 *
 * The indexes used to be a map of key to a set of ids. That answered "every
 * ride for this guest" perfectly well and could not answer "every ride between
 * these two dates" at all, so the season reports walked the whole table and
 * filtered, which is where the eleven second season summary came from.
 *
 * So the keys are kept in one sorted run per index and looked up by binary
 * search. Point lookups cost a search rather than a hash, which is slower on
 * paper and unmeasurable here, and a range is two searches and a slice.
 */

export type IndexKey = string;

export interface IndexDefinition<T> {
  readonly name: string;
  /** One row can sit under several keys, which is how the lift index works. */
  readonly keys: (row: T) => readonly IndexKey[];
}

export interface TableOptions<T> {
  readonly name: string;
  readonly primaryKey: (row: T) => string;
  readonly indexes?: readonly IndexDefinition<T>[] | undefined;
}

interface SortedIndex {
  /** Sorted, distinct. */
  readonly keys: IndexKey[];
  /** Parallel to `keys`. Each entry is the row ids under that key. */
  readonly buckets: Set<string>[];
}

/** Index of the first key not less than `key`. */
function lowerBound(keys: readonly IndexKey[], key: IndexKey): number {
  let low = 0;
  let high = keys.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const at = keys[mid];
    if (at !== undefined && at < key) low = mid + 1;
    else high = mid;
  }
  return low;
}

export class Table<T> {
  private readonly rows = new Map<string, T>();
  private readonly indexes = new Map<string, SortedIndex>();
  private readonly definitions: readonly IndexDefinition<T>[];

  constructor(private readonly options: TableOptions<T>) {
    this.definitions = options.indexes ?? [];
    for (const definition of this.definitions) {
      this.indexes.set(definition.name, { keys: [], buckets: [] });
    }
  }

  get name(): string {
    return this.options.name;
  }

  get size(): number {
    return this.rows.size;
  }

  private indexOf(name: string): SortedIndex {
    const index = this.indexes.get(name);
    if (index === undefined) {
      throw new SheaveholdError('table.no_index', `${this.name} has no index ${name}`, {
        table: this.name,
        index: name,
      });
    }
    return index;
  }

  private bucketFor(index: SortedIndex, key: IndexKey, create: boolean): Set<string> | undefined {
    const at = lowerBound(index.keys, key);
    if (index.keys[at] === key) return index.buckets[at];
    if (!create) return undefined;
    const bucket = new Set<string>();
    index.keys.splice(at, 0, key);
    index.buckets.splice(at, 0, bucket);
    return bucket;
  }

  private addToIndexes(id: string, row: T): void {
    for (const definition of this.definitions) {
      const index = this.indexOf(definition.name);
      for (const key of definition.keys(row)) {
        this.bucketFor(index, key, true)?.add(id);
      }
    }
  }

  private removeFromIndexes(id: string, row: T): void {
    for (const definition of this.definitions) {
      const index = this.indexOf(definition.name);
      for (const key of definition.keys(row)) {
        const at = lowerBound(index.keys, key);
        if (index.keys[at] !== key) continue;
        const bucket = index.buckets[at];
        if (bucket === undefined) continue;
        bucket.delete(id);
        if (bucket.size === 0) {
          index.keys.splice(at, 1);
          index.buckets.splice(at, 1);
        }
      }
    }
  }

  private materialise(bucket: Set<string> | undefined, out: T[]): void {
    if (bucket === undefined) return;
    for (const id of bucket) {
      const row = this.rows.get(id);
      if (row !== undefined) out.push(row);
    }
  }

  insert(row: T): void {
    const id = this.options.primaryKey(row);
    if (this.rows.has(id)) {
      throw new SheaveholdError('table.duplicate', `${this.name} already holds ${id}`, {
        table: this.name,
        id,
      });
    }
    this.rows.set(id, row);
    this.addToIndexes(id, row);
  }

  upsert(row: T): void {
    const id = this.options.primaryKey(row);
    const existing = this.rows.get(id);
    if (existing !== undefined) this.removeFromIndexes(id, existing);
    this.rows.set(id, row);
    this.addToIndexes(id, row);
  }

  delete(id: string): boolean {
    const existing = this.rows.get(id);
    if (existing === undefined) return false;
    this.removeFromIndexes(id, existing);
    return this.rows.delete(id);
  }

  get(id: string): T | undefined {
    return this.rows.get(id);
  }

  has(id: string): boolean {
    return this.rows.has(id);
  }

  all(): T[] {
    return [...this.rows.values()];
  }

  ids(): string[] {
    return [...this.rows.keys()];
  }

  by(indexName: string, key: IndexKey): T[] {
    const index = this.indexOf(indexName);
    const out: T[] = [];
    this.materialise(this.bucketFor(index, key, false), out);
    return out;
  }

  /** Every row whose key falls in `[from, to]`, which the season reports want. */
  between(indexName: string, from: IndexKey, to: IndexKey): T[] {
    if (to < from) return [];
    const index = this.indexOf(indexName);
    const start = lowerBound(index.keys, from);
    const out: T[] = [];
    for (let at = start; at < index.keys.length; at += 1) {
      const key = index.keys[at];
      if (key === undefined || key > to) break;
      this.materialise(index.buckets[at], out);
    }
    return out;
  }

  /** Keys in `[from, to]`, which is how a report knows which days had traffic. */
  keysBetween(indexName: string, from: IndexKey, to: IndexKey): IndexKey[] {
    if (to < from) return [];
    const index = this.indexOf(indexName);
    const start = lowerBound(index.keys, from);
    const out: IndexKey[] = [];
    for (let at = start; at < index.keys.length; at += 1) {
      const key = index.keys[at];
      if (key === undefined || key > to) break;
      out.push(key);
    }
    return out;
  }

  keysOf(indexName: string): IndexKey[] {
    return [...this.indexOf(indexName).keys];
  }

  countBy(indexName: string, key: IndexKey): number {
    return this.bucketFor(this.indexOf(indexName), key, false)?.size ?? 0;
  }

  filter(predicate: (row: T) => boolean): T[] {
    return this.all().filter(predicate);
  }

  clear(): void {
    this.rows.clear();
    for (const index of this.indexes.values()) {
      index.keys.length = 0;
      index.buckets.length = 0;
    }
  }

  /** Rebuild every index from the rows, used after loading a snapshot. */
  reindex(): void {
    for (const index of this.indexes.values()) {
      index.keys.length = 0;
      index.buckets.length = 0;
    }
    for (const [id, row] of this.rows) this.addToIndexes(id, row);
  }

  load(rows: readonly T[]): void {
    this.clear();
    for (const row of rows) this.upsert(row);
  }
}
