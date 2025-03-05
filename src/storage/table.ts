import { SheaveholdError } from '../util/diagnostic.js';

/**
 * The store keeps everything in memory. A whole season is about two million
 * rides, which is well inside what the base station has, and it means every
 * report is a walk over an array rather than a query somebody has to tune.
 *
 * What it does need is indexes. Finding every ride for a guest by scanning two
 * million rows took eleven seconds in the guest history endpoint, so a table
 * carries named secondary indexes and maintains them on write.
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

export class Table<T> {
  private readonly rows = new Map<string, T>();
  private readonly indexes = new Map<string, Map<IndexKey, Set<string>>>();
  private readonly definitions: readonly IndexDefinition<T>[];

  constructor(private readonly options: TableOptions<T>) {
    this.definitions = options.indexes ?? [];
    for (const definition of this.definitions) {
      this.indexes.set(definition.name, new Map());
    }
  }

  get name(): string {
    return this.options.name;
  }

  get size(): number {
    return this.rows.size;
  }

  private indexOf(name: string): Map<IndexKey, Set<string>> {
    const index = this.indexes.get(name);
    if (index === undefined) {
      throw new SheaveholdError('table.no_index', `${this.name} has no index ${name}`, {
        table: this.name,
        index: name,
      });
    }
    return index;
  }

  private addToIndexes(id: string, row: T): void {
    for (const definition of this.definitions) {
      const index = this.indexOf(definition.name);
      for (const key of definition.keys(row)) {
        const bucket = index.get(key);
        if (bucket === undefined) index.set(key, new Set([id]));
        else bucket.add(id);
      }
    }
  }

  private removeFromIndexes(id: string, row: T): void {
    for (const definition of this.definitions) {
      const index = this.indexOf(definition.name);
      for (const key of definition.keys(row)) {
        const bucket = index.get(key);
        if (bucket === undefined) continue;
        bucket.delete(id);
        if (bucket.size === 0) index.delete(key);
      }
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
    const bucket = this.indexOf(indexName).get(key);
    if (bucket === undefined) return [];
    const out: T[] = [];
    for (const id of bucket) {
      const row = this.rows.get(id);
      if (row !== undefined) out.push(row);
    }
    return out;
  }

  keysOf(indexName: string): IndexKey[] {
    return [...this.indexOf(indexName).keys()].sort();
  }

  countBy(indexName: string, key: IndexKey): number {
    return this.indexOf(indexName).get(key)?.size ?? 0;
  }

  filter(predicate: (row: T) => boolean): T[] {
    return this.all().filter(predicate);
  }

  clear(): void {
    this.rows.clear();
    for (const index of this.indexes.values()) index.clear();
  }

  /** Rebuild every index from the rows, used after loading a snapshot. */
  reindex(): void {
    for (const index of this.indexes.values()) index.clear();
    for (const [id, row] of this.rows) this.addToIndexes(id, row);
  }

  load(rows: readonly T[]): void {
    this.clear();
    for (const row of rows) this.upsert(row);
  }
}
