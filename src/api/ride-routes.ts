import { parseOperatingDate } from '../util/clock.js';
import { parseLiftCode } from '../util/ids.js';
import type { Ride } from '../domain/ride/ride.js';
import type { Visit } from '../domain/visit/visit.js';
import { guestHistory, type GuestQueryContext } from '../service/guest-query.js';
import { recomputeDate, type RecomputeContext } from '../service/recompute.js';
import type { RideStore } from '../storage/repository/rides.js';
import { fail } from './problems.js';
import { ok, type Router } from './router.js';

/**
 * Rides and visits, which is what everything except the uploader actually
 * reads. The recompute route is here rather than under an admin prefix because
 * rebuilding a day is an ordinary thing to do after a late upload, not an
 * emergency, and hiding it made people restart the process instead.
 */

export function toRideWire(ride: Ride): Record<string, unknown> {
  return {
    id: ride.id,
    date: ride.operatingDate,
    lift: ride.lift,
    terminal: ride.terminalId,
    guest: ride.guestId,
    entitlement: ride.entitlementId,
    product: ride.productCode,
    boardedAt: ride.boardedAt.toISOString(),
    unloadsAt: ride.unloadsAt.toISOString(),
    verticalFt: ride.verticalFt,
  };
}

export function toVisitWire(visit: Visit): Record<string, unknown> {
  return {
    id: visit.id,
    date: visit.operatingDate,
    guest: visit.guestId,
    entitlement: visit.entitlementId,
    product: visit.productCode,
    firstRideAt: visit.firstRideAt.toISOString(),
    lastRideAt: visit.lastRideAt.toISOString(),
    rides: visit.rideCount,
    verticalFt: visit.verticalFt,
    lifts: visit.lifts,
    sessions: visit.sessions.length,
    spanMinutes: visit.spanMinutes,
  };
}

export interface RideRouteContext {
  readonly rides: RideStore;
  readonly guests: GuestQueryContext;
  readonly recompute: RecomputeContext;
}

export function addRideRoutes(router: Router, context: RideRouteContext): Router {
  router.add({
    method: 'GET',
    path: '/rides/day/:date',
    summary: 'every ride on one operating day',
    handler: ({ params }) => {
      const date = parseOperatingDate(params['date'] ?? '');
      if (!date.ok) return fail('bad_date', date.error);
      return ok({ date: date.value, rides: context.rides.ridesOn(date.value).map(toRideWire) });
    },
  });

  router.add({
    method: 'GET',
    path: '/rides/lift/:lift/:date',
    summary: 'every ride on one lift on one day',
    handler: ({ params }) => {
      const lift = parseLiftCode(params['lift'] ?? '');
      if (!lift.ok) return fail('bad_lift', lift.error);
      const date = parseOperatingDate(params['date'] ?? '');
      if (!date.ok) return fail('bad_date', date.error);
      return ok({
        lift: lift.value,
        date: date.value,
        rides: context.rides.ridesOnLift(lift.value, date.value).map(toRideWire),
      });
    },
  });

  router.add({
    method: 'GET',
    path: '/visits/day/:date',
    summary: 'every visit on one operating day',
    handler: ({ params }) => {
      const date = parseOperatingDate(params['date'] ?? '');
      if (!date.ok) return fail('bad_date', date.error);
      return ok({
        date: date.value,
        skierVisits: context.rides.skierVisitsOn(date.value),
        visits: context.rides.visitsOn(date.value).map(toVisitWire),
      });
    },
  });

  router.add({
    method: 'GET',
    path: '/guests/:guest',
    summary: 'what a guest is carrying and where they have been',
    handler: ({ params }) => {
      const history = guestHistory(params['guest'] ?? '', context.guests);
      if (history === undefined) return fail('no_guest', `no guest ${params['guest'] ?? ''}`);
      return ok({
        guest: history.guest.id,
        name: history.name,
        ageBand: history.ageBand ?? null,
        household: history.householdId ?? null,
        daysSkied: history.daysSkied,
        rides: history.totalRides,
        verticalFt: history.totalVerticalFt,
        favouriteLift: history.favouriteLift ?? null,
        entitlements: history.entitlements.map((line) => ({
          id: line.entitlementId,
          product: line.productCode,
          daysUsed: line.daysUsed,
          daysLeft: line.unlimited ? null : line.daysLeft,
          voided: line.voided,
        })),
      });
    },
  });

  router.add({
    method: 'POST',
    path: '/rides/day/:date/recompute',
    summary: 'rebuild one day from the scans on file',
    scope: 'write',
    handler: ({ params }) => {
      const date = parseOperatingDate(params['date'] ?? '');
      if (!date.ok) return fail('bad_date', date.error);
      const result = recomputeDate(date.value, context.recompute);
      return ok(
        {
          date: result.date,
          scans: result.scansConsidered,
          suppressed: result.suppressed,
          rides: result.rides.length,
          visits: result.visits.length,
          turnedAway: result.turnedAway,
        },
        202,
      );
    },
  });

  return router;
}
