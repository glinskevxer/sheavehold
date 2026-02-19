import { operatingDaysBetween, type OperatingDate } from '../util/clock.js';
import { distinctSorted, sumBy } from '../util/collect.js';
import { cents, formatMoney, type Cents } from '../util/money.js';
import { isUnlimited } from '../domain/product/product.js';
import type { ReferenceStore } from '../storage/repository/reference.js';
import type { RideStore } from '../storage/repository/rides.js';
import { costPerVisit } from '../domain/revenue/attribution.js';

/**
 * Who to write to in April. The renewal letter goes out to everybody, which is
 * fine, but the one with the offer in it costs money to send and the area only
 * wants to spend that on people who are actually on the fence.
 *
 * The signal is not how much somebody skied. It is the gap between what they
 * paid a day and what a day ticket costs: a pass holder who came thirty times
 * knows the pass paid for itself and renews without being asked. The one who
 * came five times is doing the arithmetic and losing.
 */

export type RenewalSignal = 'safe' | 'undecided' | 'at_risk' | 'lapsed';

export interface RenewalRow {
  readonly guestId: string;
  readonly entitlementId: string;
  readonly productCode: string;
  readonly daysSkied: number;
  readonly pricePaid: Cents;
  readonly costPerDay: Cents;
  readonly walkUpPrice: Cents;
  readonly signal: RenewalSignal;
  readonly lastSeen: OperatingDate | undefined;
  readonly daysSinceLastSeen: number | undefined;
  readonly note: string;
}

export interface RenewalContext {
  readonly reference: ReferenceStore;
  readonly rides: RideStore;
  readonly asOf: OperatingDate;
  readonly walkUpCode?: string | undefined;
}

/** Nobody who has not been out for this long is deciding anything. */
export const LAPSED_AFTER_DAYS = 45;

function signalFor(
  days: number,
  costPerDay: Cents,
  walkUp: Cents,
  sinceLastSeen: number | undefined,
): { signal: RenewalSignal; note: string } {
  if (days === 0) return { signal: 'lapsed', note: 'bought a pass and never used it' };
  if (sinceLastSeen !== undefined && sinceLastSeen > LAPSED_AFTER_DAYS) {
    return { signal: 'lapsed', note: `has not been out for ${sinceLastSeen} days` };
  }
  if (costPerDay <= walkUp) return { signal: 'safe', note: 'the pass has paid for itself' };
  if (costPerDay <= walkUp * 2) return { signal: 'undecided', note: 'close to breaking even' };
  return { signal: 'at_risk', note: 'a long way from breaking even' };
}

export function renewalRows(context: RenewalContext): RenewalRow[] {
  const walkUp = context.reference.findProduct(context.walkUpCode ?? 'ADAY')?.listPrice ?? cents(0);
  const rows: RenewalRow[] = [];

  for (const entitlement of context.reference.entitlements.all()) {
    const product = context.reference.findProduct(entitlement.productCode);
    if (product === undefined || !isUnlimited(product)) continue;

    const visits = context.rides.visitsOfEntitlement(entitlement.id);
    const dates = distinctSorted(visits, (visit) => visit.operatingDate) as OperatingDate[];
    const lastSeen = dates.at(-1);
    const since = lastSeen === undefined ? undefined : operatingDaysBetween(lastSeen, context.asOf);
    const perDay = costPerVisit(entitlement, product, dates.length);
    const verdict = signalFor(dates.length, perDay, walkUp, since);

    rows.push({
      guestId: entitlement.guestId,
      entitlementId: entitlement.id,
      productCode: entitlement.productCode,
      daysSkied: dates.length,
      pricePaid: entitlement.pricePaid,
      costPerDay: perDay,
      walkUpPrice: walkUp,
      signal: verdict.signal,
      lastSeen,
      daysSinceLastSeen: since,
      note: verdict.note,
    });
  }

  return rows.sort(
    (a, b) => b.costPerDay - a.costPerDay || a.entitlementId.localeCompare(b.entitlementId),
  );
}

export interface RenewalSummary {
  readonly safe: number;
  readonly undecided: number;
  readonly atRisk: number;
  readonly lapsed: number;
  readonly valueAtRisk: Cents;
  readonly valueAtRiskFormatted: string;
}

export function summariseRenewals(rows: readonly RenewalRow[]): RenewalSummary {
  const fence = rows.filter((row) => row.signal === 'at_risk' || row.signal === 'undecided');
  const value = cents(sumBy(fence, (row) => row.pricePaid));
  return {
    safe: rows.filter((row) => row.signal === 'safe').length,
    undecided: rows.filter((row) => row.signal === 'undecided').length,
    atRisk: rows.filter((row) => row.signal === 'at_risk').length,
    lapsed: rows.filter((row) => row.signal === 'lapsed').length,
    valueAtRisk: value,
    valueAtRiskFormatted: formatMoney(value),
  };
}

/** The list the offer actually goes to. */
export function offerList(rows: readonly RenewalRow[]): RenewalRow[] {
  return rows.filter((row) => row.signal === 'undecided' || row.signal === 'at_risk');
}
