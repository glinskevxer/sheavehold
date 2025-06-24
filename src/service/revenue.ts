import { operatingDateRange, type OperatingDate } from '../util/clock.js';
import { groupBy, sumBy } from '../util/collect.js';
import { cents, formatMoney, ZERO, type Cents } from '../util/money.js';
import { isUnlimited } from '../domain/product/product.js';
import {
  attributeAll,
  costPerVisit,
  valueByDate,
  valueByProduct,
  type AttributionOptions,
  type AttributionResult,
} from '../domain/revenue/attribution.js';
import type { ReferenceStore } from '../storage/repository/reference.js';
import type { RideStore } from '../storage/repository/rides.js';

/**
 * What a day was worth, and what a season pass turned out to cost the guest
 * who bought it. The second one is the number the marketing office quotes back
 * at renewal time, and the only honest way to compute it is after the season,
 * over the visits that actually happened.
 */

export interface RevenueContext {
  readonly reference: ReferenceStore;
  readonly rides: RideStore;
}

export function attributeSeason(
  context: RevenueContext,
  options: AttributionOptions = {},
): AttributionResult {
  return attributeAll(
    {
      entitlements: context.reference.entitlements.all(),
      products: { find: (code) => context.reference.findProduct(code) },
      visits: context.rides.visits.all(),
    },
    options,
  );
}

export interface DayRevenue {
  readonly date: OperatingDate;
  readonly value: Cents;
  readonly visits: number;
  readonly perVisit: Cents;
  readonly formatted: string;
}

export function dayRevenue(
  from: OperatingDate,
  to: OperatingDate,
  context: RevenueContext,
  options: AttributionOptions = {},
): DayRevenue[] {
  const result = attributeSeason(context, options);
  const byDate = valueByDate(result);
  return operatingDateRange(from, to).map((date) => {
    const value = byDate.get(date) ?? ZERO;
    const visits = context.rides.visitsOn(date).length;
    const perVisit = visits === 0 ? ZERO : cents(Math.round(value / visits));
    return { date, value, visits, perVisit, formatted: formatMoney(value) };
  });
}

export interface ProductRevenue {
  readonly productCode: string;
  readonly productName: string;
  readonly value: Cents;
  readonly entitlements: number;
  readonly visits: number;
  readonly perVisit: Cents;
}

export function productRevenue(
  context: RevenueContext,
  options: AttributionOptions = {},
): ProductRevenue[] {
  const result = attributeSeason(context, options);
  const byProduct = valueByProduct(result);
  const visitsByProduct = groupBy(context.rides.visits.all(), (visit) => visit.productCode);

  const rows: ProductRevenue[] = [];
  for (const [code, value] of byProduct) {
    const product = context.reference.findProduct(code);
    const visits = visitsByProduct.get(code)?.length ?? 0;
    rows.push({
      productCode: code,
      productName: product?.name ?? 'unknown product',
      value,
      entitlements: context.reference.entitlements.by('product', code).length,
      visits,
      perVisit: visits === 0 ? ZERO : cents(Math.round(value / visits)),
    });
  }
  return rows.sort((a, b) => b.value - a.value || a.productCode.localeCompare(b.productCode));
}

export interface PassValueLine {
  readonly entitlementId: string;
  readonly guestId: string;
  readonly productCode: string;
  readonly pricePaid: Cents;
  readonly daysSkied: number;
  readonly costPerDay: Cents;
  readonly beatWalkUp: boolean;
}

/**
 * What each unlimited pass cost its holder per day out, and whether that beat
 * buying a day ticket every time. The comparison is against the adult day
 * ticket list price, which is what a guest would have paid at the window.
 */
export function passValue(context: RevenueContext, walkUpCode = 'ADAY'): PassValueLine[] {
  const walkUp = context.reference.findProduct(walkUpCode)?.listPrice ?? ZERO;
  const lines: PassValueLine[] = [];

  for (const entitlement of context.reference.entitlements.all()) {
    const product = context.reference.findProduct(entitlement.productCode);
    if (product === undefined || !isUnlimited(product)) continue;
    const days = context.rides.daysUsedBy(entitlement.id).length;
    const perDay = costPerVisit(entitlement, product, days);
    lines.push({
      entitlementId: entitlement.id,
      guestId: entitlement.guestId,
      productCode: entitlement.productCode,
      pricePaid: entitlement.pricePaid,
      daysSkied: days,
      costPerDay: perDay,
      beatWalkUp: days > 0 && perDay < walkUp,
    });
  }
  return lines.sort(
    (a, b) => b.daysSkied - a.daysSkied || a.entitlementId.localeCompare(b.entitlementId),
  );
}

export function seasonTotal(context: RevenueContext, options: AttributionOptions = {}): Cents {
  const result = attributeSeason(context, options);
  return cents(sumBy(result.lines, (line) => line.value));
}
