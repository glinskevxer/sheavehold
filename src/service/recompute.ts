import type { OperatingDate } from '../util/clock.js';
import { DiagnosticBag } from '../util/diagnostic.js';
import type { OperatingCalendar } from '../domain/calendar/season.js';
import type { LiftRegistry } from '../domain/lift/lift.js';
import type { TerminalRegistry } from '../domain/lift/terminal.js';
import type { BlackoutRegistry } from '../domain/product/blackout.js';
import type { ProductCatalogue } from '../domain/product/product.js';
import { admitScans, type AdmissionResult } from '../domain/scan/admission.js';
import {
  authoriseScans,
  DayUseLedger,
  type AuthorisationResult,
} from '../domain/scan/authorise.js';
import { dedupe, type DedupeResult } from '../domain/scan/dedupe.js';
import { rejectionOf, rejectionTally, turnaways } from '../domain/scan/reasons.js';
import { buildRides, type Ride } from '../domain/ride/ride.js';
import { buildVisits, type Visit } from '../domain/visit/visit.js';
import type { ReferenceStore } from '../storage/repository/reference.js';
import type { RideStore } from '../storage/repository/rides.js';
import type { ScanStore } from '../storage/repository/scans.js';

/**
 * A day, rebuilt from the scans that are on file right now. This is the only
 * place rides and visits are created, and it always does a whole day, because
 * the day counter on a multi day ticket depends on the order of the whole
 * stream and half a day gives an answer that is neither right nor stable.
 *
 * The day use ledger is seeded from the visits already stored for the season so
 * far, otherwise a rebuild of one day in March would think every three day
 * ticket still had all three.
 */

export interface RecomputeResult {
  readonly date: OperatingDate;
  readonly scansConsidered: number;
  readonly suppressed: number;
  readonly admitted: number;
  readonly refused: number;
  readonly turnedAway: number;
  readonly rides: readonly Ride[];
  readonly visits: readonly Visit[];
  readonly rejections: ReadonlyMap<string, number>;
  readonly diagnostics: DiagnosticBag;
}

export interface RecomputeContext {
  readonly reference: ReferenceStore;
  readonly scans: ScanStore;
  readonly rides: RideStore;
  readonly terminals: TerminalRegistry;
  readonly lifts: LiftRegistry;
  readonly products: ProductCatalogue;
  readonly calendar: OperatingCalendar;
  readonly blackouts: BlackoutRegistry;
  readonly sessionGapMinutes?: number | undefined;
}

/**
 * Days already counted against every entitlement, excluding the day being
 * rebuilt so that day is free to count itself again.
 */
export function seedLedger(context: RecomputeContext, exclude: OperatingDate): DayUseLedger {
  const ledger = new DayUseLedger();
  for (const visit of context.rides.visits.all()) {
    if (visit.operatingDate === exclude) continue;
    ledger.useDay(visit.entitlementId, visit.operatingDate);
  }
  return ledger;
}

export function recomputeDate(date: OperatingDate, context: RecomputeContext): RecomputeResult {
  const diagnostics = new DiagnosticBag();
  const scans = context.scans.onDate(date);

  const deduped: DedupeResult = dedupe(scans, { terminals: context.terminals });
  const admissions: AdmissionResult[] = admitScans(deduped.kept, {
    terminals: context.terminals,
    bindings: context.reference.bindings,
    media: context.reference.mediaMap(),
  });
  const authorisations: AuthorisationResult[] = authoriseScans(admissions, {
    entitlements: context.reference.entitlementMap(),
    products: context.products,
    calendar: context.calendar,
    blackouts: context.blackouts,
    ledger: seedLedger(context, date),
  });

  const rides = buildRides(authorisations, { lifts: context.lifts });
  const visitOptions =
    context.sessionGapMinutes === undefined ? {} : { sessionGapMinutes: context.sessionGapMinutes };
  const visits = buildVisits(rides, visitOptions);

  context.rides.replaceDate(date, rides, visits);

  const refused = authorisations.filter((result) => rejectionOf(result) !== undefined).length;
  if (scans.length > 0 && rides.length === 0) {
    diagnostics.warn('recompute.no_rides', `${date} has scans and produced no rides`, { date });
  }
  diagnostics.info('recompute.done', `${date} rebuilt to ${rides.length} rides`, {
    date,
    rides: rides.length,
    visits: visits.length,
  });

  return {
    date,
    scansConsidered: scans.length,
    suppressed: deduped.suppressed.length,
    admitted: authorisations.filter((result) => result.allowed).length,
    refused,
    turnedAway: turnaways(authorisations).length,
    rides,
    visits,
    rejections: rejectionTally(authorisations),
    diagnostics,
  };
}

/** Rebuild several days in date order, which the ledger seeding needs. */
export function recomputeDates(
  dates: readonly OperatingDate[],
  context: RecomputeContext,
): RecomputeResult[] {
  return [...dates].sort().map((date) => recomputeDate(date, context));
}
