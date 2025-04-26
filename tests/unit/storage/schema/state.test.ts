import { describe, expect, it } from 'vitest';
import {
  INITIAL_STATE,
  isStoreState,
  migration001,
  stateCounts,
  type StoreStateV1,
} from '../../../../src/storage/schema/state.js';
import { migrate } from '../../../../src/storage/migrations.js';
import { expect as expectOk } from '../../../../src/util/result.js';

const scanRow = {
  terminalId: 'SUNB.01',
  lift: 'SUNB',
  maze: 'SUNB',
  mediaSerial: 'E2004A1B00000123',
  at: '2025-01-13T17:00:08.000Z',
  reportedAt: '2025-01-13T17:00:00.000Z',
  correctionMs: 8000,
  operatingDate: '2025-01-13',
  sequence: 1,
  outcome: 'accept' as const,
  gateReason: '',
  rssi: -52,
  weakRead: false,
};

describe('the initial shape', () => {
  it('is empty at schema one', () => {
    expect(INITIAL_STATE).toEqual({
      schemaVersion: 1,
      scans: [],
      rides: [],
      visits: [],
      batches: [],
      throughSequence: 0,
    });
  });

  it('counts what it holds', () => {
    const state: StoreStateV1 = { ...INITIAL_STATE, scans: [scanRow] };
    expect(stateCounts(state)).toEqual({ scans: 1, rides: 0, visits: 0, batches: 0 });
  });

  it('recognises a store state and rejects something else', () => {
    expect(isStoreState(INITIAL_STATE)).toBe(true);
    expect(isStoreState({ schemaVersion: 1 })).toBe(false);
    expect(isStoreState({ schemaVersion: 1, scans: [], rides: [], visits: [] })).toBe(false);
  });
});

describe('migration one', () => {
  it('turns a store from before the snapshot into an empty one', () => {
    const outcome = expectOk(migrate({ schemaVersion: 0 }, [migration001]), 'migrate');
    expect(outcome.state).toEqual(INITIAL_STATE);
    expect(outcome.toVersion).toBe(1);
  });

  it('keeps rows that were already there', () => {
    const outcome = expectOk(
      migrate({ schemaVersion: 0, scans: [scanRow], throughSequence: 44 }, [migration001]),
      'migrate',
    );
    const state = outcome.state as StoreStateV1;
    expect(state.scans).toHaveLength(1);
    expect(state.throughSequence).toBe(44);
    expect(state.rides).toEqual([]);
  });

  it('replaces a field that is the wrong shape rather than trusting it', () => {
    const outcome = expectOk(
      migrate({ schemaVersion: 0, rides: 'nothing', throughSequence: 'later' }, [migration001]),
      'migrate',
    );
    const state = outcome.state as StoreStateV1;
    expect(state.rides).toEqual([]);
    expect(state.throughSequence).toBe(0);
  });

  it('leaves an unknown field alone rather than dropping it', () => {
    const outcome = expectOk(
      migrate({ schemaVersion: 0, weather: [{ day: '2025-01-13' }] }, [migration001]),
      'migrate',
    );
    expect(outcome.state.weather).toEqual([{ day: '2025-01-13' }]);
  });

  it('does nothing to a store already at one', () => {
    const outcome = expectOk(migrate({ ...INITIAL_STATE }, [migration001]), 'migrate');
    expect(outcome.applied).toEqual([]);
    expect(outcome.state).toEqual(INITIAL_STATE);
  });

  it('is numbered one and named', () => {
    expect(migration001.id).toBe(1);
    expect(migration001.name).toContain('snapshot');
  });
});
