import { describe, expect, it } from 'vitest';
import {
  countSessions,
  exceptionId,
  migration002,
  type StoreStateV2,
} from '../../../../src/storage/schema/migration-002.js';
import { migration001, type StoredRideRow } from '../../../../src/storage/schema/state.js';
import { migrate } from '../../../../src/storage/migrations.js';
import { expect as expectOk } from '../../../../src/util/result.js';

function ride(minutes: number, overrides: Partial<StoredRideRow> = {}): StoredRideRow {
  const base = new Date('2025-01-13T17:00:00Z').getTime();
  return {
    id: `R-${minutes}`,
    mediaSerial: 'E2004A1B00000123',
    guestId: 'G-77',
    entitlementId: 'ENT-1001',
    productCode: 'SEAS',
    lift: 'SUNB',
    terminalId: 'SUNB.01',
    boardedAt: new Date(base + minutes * 60_000).toISOString(),
    operatingDate: '2025-01-13',
    verticalFt: 1240,
    rideMinutes: 7.5,
    unloadsAt: new Date(base + (minutes + 7.5) * 60_000).toISOString(),
    sequence: minutes,
    overriddenGate: false,
    ...overrides,
  };
}

const visit = {
  id: 'V-2025-01-13-G-77-ENT-1001',
  guestId: 'G-77',
  entitlementId: 'ENT-1001',
  productCode: 'SEAS',
  operatingDate: '2025-01-13',
  firstRideAt: '2025-01-13T17:00:00.000Z',
  lastRideAt: '2025-01-13T22:00:00.000Z',
  rideCount: 3,
  verticalFt: 3720,
  lifts: ['SUNB'],
  spanMinutes: 300,
};

describe('counting sessions for the backfill', () => {
  it('counts a steady morning as one', () => {
    expect(countSessions([ride(0), ride(20), ride(40)], 150)).toBe(1);
  });

  it('splits on a long gap', () => {
    expect(countSessions([ride(0), ride(20), ride(300)], 150)).toBe(2);
  });

  it('does not split exactly on the gap', () => {
    expect(countSessions([ride(0), ride(150)], 150)).toBe(1);
  });

  it('sorts before it counts', () => {
    expect(countSessions([ride(300), ride(0), ride(20)], 150)).toBe(2);
  });

  it('counts nothing for no rides and one for a single ride', () => {
    expect(countSessions([], 150)).toBe(0);
    expect(countSessions([ride(0)], 150)).toBe(1);
  });
});

describe('migration two', () => {
  it('adds an empty register and a counter', () => {
    const outcome = expectOk(
      migrate({ schemaVersion: 1 }, [migration001, migration002]),
      'migrate',
    );
    const state = outcome.state as StoreStateV2;
    expect(state.exceptions).toEqual([]);
    expect(state.nextExceptionNumber).toBe(1);
    expect(state.schemaVersion).toBe(2);
  });

  it('backfills the session count from the rides', () => {
    const outcome = expectOk(
      migrate(
        {
          schemaVersion: 1,
          rides: [ride(0), ride(20), ride(300)],
          visits: [visit],
          batches: [],
          scans: [],
          throughSequence: 0,
        },
        [migration001, migration002],
      ),
      'migrate',
    );
    const state = outcome.state as StoreStateV2;
    expect(state.visits[0]).toMatchObject({ sessionCount: 2, rideCount: 3 });
  });

  it('gives a visit with no rides a count of nothing', () => {
    const outcome = expectOk(
      migrate(
        {
          schemaVersion: 1,
          rides: [],
          visits: [visit],
          batches: [],
          scans: [],
          throughSequence: 0,
        },
        [migration001, migration002],
      ),
      'migrate',
    );
    const state = outcome.state as StoreStateV2;
    expect(state.visits[0]).toMatchObject({ sessionCount: 0 });
  });

  it('keeps exceptions that were somehow already there', () => {
    const outcome = expectOk(
      migrate({ schemaVersion: 1, exceptions: [{ id: 'X-000001' }], nextExceptionNumber: 9 }, [
        migration001,
        migration002,
      ]),
      'migrate',
    );
    const state = outcome.state as StoreStateV2;
    expect(state.exceptions).toHaveLength(1);
    expect(state.nextExceptionNumber).toBe(9);
  });

  it('walks a store from before the snapshot all the way up', () => {
    const outcome = expectOk(
      migrate({ schemaVersion: 0 }, [migration001, migration002]),
      'migrate',
    );
    expect(outcome.applied.map((migration) => migration.id)).toEqual([1, 2]);
    expect(outcome.toVersion).toBe(2);
  });

  it('numbers exceptions with padding so they sort', () => {
    expect(exceptionId(1)).toBe('X-000001');
    expect(exceptionId(4021)).toBe('X-004021');
  });
});
