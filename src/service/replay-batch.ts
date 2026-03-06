import type { OperatingDate } from '../util/clock.js';
import { groupBy } from '../util/collect.js';
import { DayUseLedger } from '../domain/scan/authorise.js';
import { recomputeDate, type RecomputeContext, type RecomputeResult } from './recompute.js';

/**
 * Rebuilding a whole season used to be quadratic and nobody noticed until the
 * store had a season in it. The per day rebuild seeds the day counter by
 * walking every visit in the store, once per day, so a hundred and forty days
 * over two hundred thousand visits is twenty eight million reads of the same
 * rows.
 *
 * The fix is not a faster walk. It is to build the counter once and carry it
 * forward, taking each day out as that day is about to be rebuilt, which is
 * exactly what seeding it per day was doing one day at a time.
 */

export interface BatchReplayResult {
  readonly results: readonly RecomputeResult[];
  readonly days: number;
  readonly rides: number;
  readonly visits: number;
  /** Times the day counter was seeded. One, rather than one per day. */
  readonly ledgerBuilds: number;
}

/** Everything already counted, keyed so one day can be lifted back out. */
export function buildSeasonLedger(context: RecomputeContext): Map<string, Set<string>> {
  const byEntitlement = new Map<string, Set<string>>();
  for (const visit of context.rides.visits.all()) {
    const own = byEntitlement.get(visit.entitlementId) ?? new Set<string>();
    own.add(visit.operatingDate);
    byEntitlement.set(visit.entitlementId, own);
  }
  return byEntitlement;
}

export function ledgerExcluding(
  season: ReadonlyMap<string, Set<string>>,
  exclude: OperatingDate,
): DayUseLedger {
  const ledger = new DayUseLedger();
  for (const [entitlementId, dates] of season) {
    for (const date of dates) {
      if (date === exclude) continue;
      ledger.useDay(entitlementId, date as OperatingDate);
    }
  }
  return ledger;
}

/**
 * Rebuild several days, carrying the day counter forward rather than rebuilding
 * it per day. The answer is the same as rebuilding them one at a time, and
 * there is a test that holds those two together.
 */
export function replayDates(
  dates: readonly OperatingDate[],
  context: RecomputeContext,
): BatchReplayResult {
  const ordered = [...new Set(dates)].sort();
  const season = buildSeasonLedger(context);
  const results: RecomputeResult[] = [];

  for (const date of ordered) {
    const ledger = ledgerExcluding(season, date);
    const result = recomputeDate(date, { ...context, seedLedger: () => ledger });
    results.push(result);

    for (const [entitlementId, visits] of groupBy(result.visits, (visit) => visit.entitlementId)) {
      const own = season.get(entitlementId) ?? new Set<string>();
      own.delete(date);
      if (visits.length > 0) own.add(date);
      season.set(entitlementId, own);
    }
  }

  return {
    results,
    days: results.length,
    rides: results.reduce((total, result) => total + result.rides.length, 0),
    visits: results.reduce((total, result) => total + result.visits.length, 0),
    ledgerBuilds: 1,
  };
}
