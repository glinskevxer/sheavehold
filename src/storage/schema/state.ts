import type { Migration, PersistedState } from '../migrations.js';

/**
 * What actually sits in the snapshot file. Dates go out as ISO strings because
 * JSON has no date, and every reader here turns them back rather than leaving a
 * string where the rest of the code expects a Date. That conversion used to be
 * done at three call sites and one of them forgot, which is how a season report
 * came out sorted lexically by boarding time.
 */

export interface StoredScanRow {
  readonly terminalId: string;
  readonly lift: string;
  readonly maze: string;
  readonly mediaSerial: string;
  readonly at: string;
  readonly reportedAt: string;
  readonly correctionMs: number;
  readonly operatingDate: string;
  readonly sequence: number;
  readonly outcome: 'accept' | 'reject';
  readonly gateReason: string;
  readonly rssi: number;
  readonly weakRead: boolean;
}

export interface StoredRideRow {
  readonly id: string;
  readonly mediaSerial: string;
  readonly guestId: string;
  readonly entitlementId: string;
  readonly productCode: string;
  readonly lift: string;
  readonly terminalId: string;
  readonly boardedAt: string;
  readonly operatingDate: string;
  readonly verticalFt: number;
  readonly rideMinutes: number;
  readonly unloadsAt: string;
  readonly sequence: number;
  readonly overriddenGate: boolean;
}

export interface StoredVisitRow {
  readonly id: string;
  readonly guestId: string;
  readonly entitlementId: string;
  readonly productCode: string;
  readonly operatingDate: string;
  readonly firstRideAt: string;
  readonly lastRideAt: string;
  readonly rideCount: number;
  readonly verticalFt: number;
  readonly lifts: readonly string[];
  readonly spanMinutes: number;
}

export interface StoreStateV1 extends PersistedState {
  schemaVersion: number;
  scans: StoredScanRow[];
  rides: StoredRideRow[];
  visits: StoredVisitRow[];
  batches: unknown[];
  /** Highest journal sequence folded into these rows. */
  throughSequence: number;
}

export const INITIAL_STATE: StoreStateV1 = {
  schemaVersion: 1,
  scans: [],
  rides: [],
  visits: [],
  batches: [],
  throughSequence: 0,
};

/**
 * Migration one is not "create the tables". It is the point at which the store
 * stopped being a directory of ndjson files somebody wrote in November and
 * became one snapshot. A store from before this has no schemaVersion at all,
 * so it arrives here as zero and gets the empty arrays it never had.
 */
export const migration001: Migration = {
  id: 1,
  name: 'gather the loose ndjson files into one snapshot',
  up: (state) => {
    const next: StoreStateV1 = {
      ...INITIAL_STATE,
      ...state,
      schemaVersion: 1,
      scans: Array.isArray(state.scans) ? (state.scans as StoredScanRow[]) : [],
      rides: Array.isArray(state.rides) ? (state.rides as StoredRideRow[]) : [],
      visits: Array.isArray(state.visits) ? (state.visits as StoredVisitRow[]) : [],
      batches: Array.isArray(state.batches) ? state.batches : [],
      throughSequence: typeof state.throughSequence === 'number' ? state.throughSequence : 0,
    };
    return next;
  },
};

export function isStoreState(value: PersistedState): value is StoreStateV1 {
  return (
    Array.isArray(value.scans) &&
    Array.isArray(value.rides) &&
    Array.isArray(value.visits) &&
    typeof value.throughSequence === 'number'
  );
}

export function stateCounts(state: StoreStateV1): Record<string, number> {
  return {
    scans: state.scans.length,
    rides: state.rides.length,
    visits: state.visits.length,
    batches: state.batches.length,
  };
}
