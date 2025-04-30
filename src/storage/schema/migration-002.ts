import { groupBy } from '../../util/collect.js';
import type { Migration } from '../migrations.js';
import type { StoredRideRow, StoredVisitRow, StoreStateV1 } from './state.js';

/**
 * Two changes went in together in February because they shipped together.
 *
 * The exception register got its own table. Before this the findings were
 * recomputed on every request, which meant a supervisor who had already looked
 * at one and marked it fine saw it again the next morning.
 *
 * And visits got a session count. The sessions themselves are not persisted,
 * only the count, because the food and beverage report only ever asked how
 * many. Backfilling it needs the rides, so this migration reads them and
 * groups by visit the same way the builder does.
 */

export interface StoredExceptionRow {
  readonly id: string;
  readonly kind: string;
  readonly operatingDate: string;
  readonly subject: string;
  readonly detail: string;
  readonly raisedAt: string;
  readonly disposition: string;
  readonly dispositionNote: string;
  readonly dispositionAt: string | undefined;
}

export interface StoreStateV2 extends StoreStateV1 {
  exceptions: StoredExceptionRow[];
  nextExceptionNumber: number;
}

/** The gap the builder used when these visits were first written. */
const BACKFILL_SESSION_GAP_MINUTES = 150;

export function countSessions(rides: readonly StoredRideRow[], gapMinutes: number): number {
  if (rides.length === 0) return 0;
  const ordered = [...rides].sort((a, b) => a.boardedAt.localeCompare(b.boardedAt));
  let sessions = 1;
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    if (previous === undefined || current === undefined) continue;
    const gap =
      (new Date(current.boardedAt).getTime() - new Date(previous.boardedAt).getTime()) / 60_000;
    if (gap > gapMinutes) sessions += 1;
  }
  return sessions;
}

export const migration002: Migration = {
  id: 2,
  name: 'add the exception register and count the sessions on old visits',
  up: (state) => {
    const before = state as StoreStateV1;
    const rides = Array.isArray(before.rides) ? before.rides : [];
    const visits = Array.isArray(before.visits) ? before.visits : [];

    const ridesByVisit = groupBy(
      rides,
      (ride) => `V-${ride.operatingDate}-${ride.guestId}-${ride.entitlementId}`,
    );

    const rewritten: (StoredVisitRow & { sessionCount: number })[] = visits.map((visit) => ({
      ...visit,
      sessionCount: countSessions(ridesByVisit.get(visit.id) ?? [], BACKFILL_SESSION_GAP_MINUTES),
    }));

    const next: StoreStateV2 = {
      ...before,
      schemaVersion: 2,
      visits: rewritten,
      exceptions: Array.isArray((before as Partial<StoreStateV2>).exceptions)
        ? ((before as StoreStateV2).exceptions ?? [])
        : [],
      nextExceptionNumber:
        typeof (before as Partial<StoreStateV2>).nextExceptionNumber === 'number'
          ? ((before as StoreStateV2).nextExceptionNumber ?? 1)
          : 1,
    };
    return next;
  },
};

export function exceptionId(number_: number): string {
  return `X-${String(number_).padStart(6, '0')}`;
}
