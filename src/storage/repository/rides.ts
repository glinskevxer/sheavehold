import type { OperatingDate } from '../../util/clock.js';
import { distinctSorted, sumBy } from '../../util/collect.js';
import type { LiftCode } from '../../util/ids.js';
import { compareRides, type Ride } from '../../domain/ride/ride.js';
import type { Visit } from '../../domain/visit/visit.js';
import { Table } from '../table.js';

/**
 * The derived side of the store. Nothing in here is authoritative: rides and
 * visits are a function of the scans and the rules, and a rule change throws
 * them away and rebuilds them.
 *
 * That is why `replaceDate` exists and why nothing appends a single ride. A day
 * is recomputed whole or not at all, because a half recomputed day gives a
 * skier visit count that is neither the old answer nor the new one.
 */

export class RideStore {
  readonly rides = new Table<Ride>({
    name: 'rides',
    primaryKey: (row) => row.id,
    indexes: [
      { name: 'date', keys: (row) => [row.operatingDate] },
      { name: 'guest', keys: (row) => [row.guestId] },
      { name: 'guest_day', keys: (row) => [`${row.guestId}#${row.operatingDate}`] },
      { name: 'lift_day', keys: (row) => [`${row.lift}#${row.operatingDate}`] },
      { name: 'entitlement', keys: (row) => [row.entitlementId] },
      { name: 'media', keys: (row) => [row.mediaSerial] },
    ],
  });

  readonly visits = new Table<Visit>({
    name: 'visits',
    primaryKey: (row) => row.id,
    indexes: [
      { name: 'date', keys: (row) => [row.operatingDate] },
      { name: 'guest', keys: (row) => [row.guestId] },
      { name: 'entitlement', keys: (row) => [row.entitlementId] },
      { name: 'product', keys: (row) => [row.productCode] },
    ],
  });

  /** Swap one day out for a freshly computed one, atomically from a reader. */
  replaceDate(date: OperatingDate, rides: readonly Ride[], visits: readonly Visit[]): void {
    for (const ride of this.rides.by('date', date)) this.rides.delete(ride.id);
    for (const visit of this.visits.by('date', date)) this.visits.delete(visit.id);
    for (const ride of rides) this.rides.upsert(ride);
    for (const visit of visits) this.visits.upsert(visit);
  }

  ridesOn(date: OperatingDate): Ride[] {
    return this.rides.by('date', date).sort(compareRides);
  }

  ridesOfGuest(guestId: string): Ride[] {
    return this.rides.by('guest', guestId).sort(compareRides);
  }

  ridesOfGuestOn(guestId: string, date: OperatingDate): Ride[] {
    return this.rides.by('guest_day', `${guestId}#${date}`).sort(compareRides);
  }

  ridesOnLift(lift: LiftCode, date: OperatingDate): Ride[] {
    return this.rides.by('lift_day', `${lift}#${date}`).sort(compareRides);
  }

  ridesOfEntitlement(entitlementId: string): Ride[] {
    return this.rides.by('entitlement', entitlementId).sort(compareRides);
  }

  visitsOn(date: OperatingDate): Visit[] {
    return this.visits
      .by('date', date)
      .sort((a, b) => a.firstRideAt.getTime() - b.firstRideAt.getTime());
  }

  visitsOfGuest(guestId: string): Visit[] {
    return this.visits
      .by('guest', guestId)
      .sort((a, b) => a.operatingDate.localeCompare(b.operatingDate));
  }

  visitsOfEntitlement(entitlementId: string): Visit[] {
    return this.visits
      .by('entitlement', entitlementId)
      .sort((a, b) => a.operatingDate.localeCompare(b.operatingDate));
  }

  /** Days an entitlement was actually used on, which the day counter needs. */
  daysUsedBy(entitlementId: string): OperatingDate[] {
    return distinctSorted(
      this.visits.by('entitlement', entitlementId),
      (visit) => visit.operatingDate,
    ) as OperatingDate[];
  }

  dates(): OperatingDate[] {
    return this.rides.keysOf('date') as OperatingDate[];
  }

  skierVisitsOn(date: OperatingDate): number {
    return new Set(this.visitsOn(date).map((visit) => visit.guestId)).size;
  }

  verticalOn(date: OperatingDate): number {
    return sumBy(this.ridesOn(date), (ride) => ride.verticalFt);
  }

  liftsThatTurned(date: OperatingDate): LiftCode[] {
    return distinctSorted(this.ridesOn(date), (ride) => ride.lift) as LiftCode[];
  }

  counts(): Record<string, number> {
    return { rides: this.rides.size, visits: this.visits.size };
  }
}
