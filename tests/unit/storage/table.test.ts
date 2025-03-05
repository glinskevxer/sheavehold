import { describe, expect, it } from 'vitest';
import { Table } from '../../../src/storage/table.js';

interface RideRow {
  id: string;
  guestId: string;
  lift: string;
  date: string;
}

function table(): Table<RideRow> {
  return new Table<RideRow>({
    name: 'rides',
    primaryKey: (row) => row.id,
    indexes: [
      { name: 'guest', keys: (row) => [row.guestId] },
      { name: 'lift', keys: (row) => [row.lift] },
      { name: 'guest_day', keys: (row) => [`${row.guestId}#${row.date}`, row.date] },
    ],
  });
}

const row = (id: string, guestId = 'G-77', lift = 'SUNB', date = '2025-01-13'): RideRow => ({
  id,
  guestId,
  lift,
  date,
});

describe('the primary key', () => {
  it('holds and finds a row', () => {
    const rides = table();
    rides.insert(row('R-1'));
    expect(rides.size).toBe(1);
    expect(rides.get('R-1')?.guestId).toBe('G-77');
    expect(rides.has('R-1')).toBe(true);
    expect(rides.get('R-2')).toBeUndefined();
  });

  it('refuses the same id twice on insert', () => {
    const rides = table();
    rides.insert(row('R-1'));
    expect(() => rides.insert(row('R-1'))).toThrow('already holds R-1');
  });

  it('replaces on upsert', () => {
    const rides = table();
    rides.insert(row('R-1'));
    rides.upsert(row('R-1', 'G-91'));
    expect(rides.size).toBe(1);
    expect(rides.get('R-1')?.guestId).toBe('G-91');
  });

  it('deletes and says whether there was anything there', () => {
    const rides = table();
    rides.insert(row('R-1'));
    expect(rides.delete('R-1')).toBe(true);
    expect(rides.delete('R-1')).toBe(false);
    expect(rides.size).toBe(0);
  });

  it('lists the rows and the ids', () => {
    const rides = table();
    rides.insert(row('R-1'));
    rides.insert(row('R-2'));
    expect(rides.ids()).toEqual(['R-1', 'R-2']);
    expect(rides.all()).toHaveLength(2);
    expect(rides.name).toBe('rides');
  });
});

describe('the secondary indexes', () => {
  it('finds every row under a key', () => {
    const rides = table();
    rides.insert(row('R-1'));
    rides.insert(row('R-2'));
    rides.insert(row('R-3', 'G-91'));
    expect(rides.by('guest', 'G-77').map((entry) => entry.id)).toEqual(['R-1', 'R-2']);
    expect(rides.by('guest', 'G-91')).toHaveLength(1);
    expect(rides.by('guest', 'G-000')).toEqual([]);
  });

  it('puts one row under several keys', () => {
    const rides = table();
    rides.insert(row('R-1'));
    expect(rides.by('guest_day', 'G-77#2025-01-13')).toHaveLength(1);
    expect(rides.by('guest_day', '2025-01-13')).toHaveLength(1);
  });

  it('moves a row between keys on upsert', () => {
    const rides = table();
    rides.insert(row('R-1'));
    rides.upsert(row('R-1', 'G-91'));
    expect(rides.by('guest', 'G-77')).toEqual([]);
    expect(rides.by('guest', 'G-91')).toHaveLength(1);
  });

  it('takes a row out of the indexes on delete', () => {
    const rides = table();
    rides.insert(row('R-1'));
    rides.delete('R-1');
    expect(rides.by('guest', 'G-77')).toEqual([]);
    expect(rides.keysOf('guest')).toEqual([]);
  });

  it('counts without building the rows', () => {
    const rides = table();
    rides.insert(row('R-1'));
    rides.insert(row('R-2'));
    expect(rides.countBy('guest', 'G-77')).toBe(2);
    expect(rides.countBy('guest', 'G-000')).toBe(0);
  });

  it('lists the keys in order', () => {
    const rides = table();
    rides.insert(row('R-1', 'G-91'));
    rides.insert(row('R-2', 'G-77'));
    expect(rides.keysOf('guest')).toEqual(['G-77', 'G-91']);
  });

  it('complains about an index nobody declared', () => {
    expect(() => table().by('colour', 'red')).toThrow('no index colour');
  });
});

describe('bulk work', () => {
  it('loads a set of rows and replaces what was there', () => {
    const rides = table();
    rides.insert(row('R-9'));
    rides.load([row('R-1'), row('R-2', 'G-91')]);
    expect(rides.ids()).toEqual(['R-1', 'R-2']);
    expect(rides.by('guest', 'G-91')).toHaveLength(1);
  });

  it('clears everything including the indexes', () => {
    const rides = table();
    rides.insert(row('R-1'));
    rides.clear();
    expect(rides.size).toBe(0);
    expect(rides.by('guest', 'G-77')).toEqual([]);
  });

  it('rebuilds the indexes without changing the rows', () => {
    const rides = table();
    rides.insert(row('R-1'));
    rides.reindex();
    expect(rides.by('guest', 'G-77')).toHaveLength(1);
    expect(rides.size).toBe(1);
  });

  it('filters over everything', () => {
    const rides = table();
    rides.load([row('R-1'), row('R-2', 'G-91', 'RIDGE')]);
    expect(rides.filter((entry) => entry.lift === 'RIDGE')).toHaveLength(1);
  });
});
