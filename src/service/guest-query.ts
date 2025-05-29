import { operatingDaysBetween, type OperatingDate } from '../util/clock.js';
import { distinctSorted, sumBy } from '../util/collect.js';
import type { LiftCode } from '../util/ids.js';
import { ageBandOn, displayName, type Guest } from '../domain/guest/guest.js';
import type { Ride } from '../domain/ride/ride.js';
import type { Visit } from '../domain/visit/visit.js';
import { daysRemaining } from '../domain/product/entitlement.js';
import type { ReferenceStore } from '../storage/repository/reference.js';
import type { RideStore } from '../storage/repository/rides.js';

/**
 * What the ticket office sees when a guest comes to the window and says the
 * gate would not let them on. It has to answer three questions in one screen:
 * what have they got, is it still good, and where have they been today.
 */

export interface EntitlementLine {
  readonly entitlementId: string;
  readonly productCode: string;
  readonly productName: string;
  readonly purchasedAt: Date;
  readonly daysUsed: readonly OperatingDate[];
  readonly daysLeft: number;
  readonly unlimited: boolean;
  readonly voided: boolean;
  readonly validFrom: OperatingDate | undefined;
  readonly validTo: OperatingDate | undefined;
}

export interface GuestHistory {
  readonly guest: Guest;
  readonly name: string;
  readonly ageBand: string | undefined;
  readonly householdId: string | undefined;
  readonly entitlements: readonly EntitlementLine[];
  readonly visits: readonly Visit[];
  readonly daysSkied: number;
  readonly totalRides: number;
  readonly totalVerticalFt: number;
  readonly favouriteLift: LiftCode | undefined;
  readonly firstSeen: OperatingDate | undefined;
  readonly lastSeen: OperatingDate | undefined;
}

export interface GuestQueryContext {
  readonly reference: ReferenceStore;
  readonly rides: RideStore;
  readonly asOf: OperatingDate;
}

function favouriteLift(rides: readonly Ride[]): LiftCode | undefined {
  const counts = new Map<LiftCode, number>();
  for (const ride of rides) counts.set(ride.lift, (counts.get(ride.lift) ?? 0) + 1);
  let best: LiftCode | undefined;
  let bestCount = 0;
  for (const [lift, count] of [...counts].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (count > bestCount) {
      best = lift;
      bestCount = count;
    }
  }
  return best;
}

export function guestHistory(
  guestId: string,
  context: GuestQueryContext,
): GuestHistory | undefined {
  const guest = context.reference.guests.get(guestId);
  if (guest === undefined) return undefined;

  const rides = context.rides.ridesOfGuest(guestId);
  const visits = context.rides.visitsOfGuest(guestId);
  const dates = distinctSorted(visits, (visit) => visit.operatingDate) as OperatingDate[];

  const entitlements: EntitlementLine[] = context.reference
    .entitlementsOfGuest(guestId)
    .map((entitlement) => {
      const product = context.reference.findProduct(entitlement.productCode);
      const used = context.rides.daysUsedBy(entitlement.id);
      const left = product === undefined ? 0 : daysRemaining(product, new Set<string>(used));
      return {
        entitlementId: entitlement.id,
        productCode: entitlement.productCode,
        productName: product?.name ?? 'unknown product',
        purchasedAt: entitlement.purchasedAt,
        daysUsed: used,
        daysLeft: Number.isFinite(left) ? left : 0,
        unlimited: !Number.isFinite(left),
        voided: entitlement.voidedAt !== undefined,
        validFrom: entitlement.validFrom,
        validTo: entitlement.validTo,
      };
    });

  return {
    guest,
    name: displayName(guest),
    ageBand: ageBandOn(guest, context.asOf),
    householdId: guest.householdId,
    entitlements,
    visits,
    daysSkied: dates.length,
    totalRides: rides.length,
    totalVerticalFt: sumBy(rides, (ride) => ride.verticalFt),
    favouriteLift: favouriteLift(rides),
    firstSeen: dates[0],
    lastSeen: dates[dates.length - 1],
  };
}

/** Everybody on one account, which is what a family asks about at the window. */
export function householdHistory(householdId: string, context: GuestQueryContext): GuestHistory[] {
  return context.reference.guests
    .by('household', householdId)
    .map((guest) => guestHistory(guest.id, context))
    .filter((history): history is GuestHistory => history !== undefined)
    .sort((a, b) => b.totalVerticalFt - a.totalVerticalFt || a.guest.id.localeCompare(b.guest.id));
}

/** Days since the guest last skied, for the renewal list. */
export function daysSinceLastVisit(history: GuestHistory, asOf: OperatingDate): number | undefined {
  if (history.lastSeen === undefined) return undefined;
  return operatingDaysBetween(history.lastSeen, asOf);
}
