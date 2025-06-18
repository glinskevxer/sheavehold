import type { OperatingDate } from '../../util/clock.js';
import { groupBy, sumBy } from '../../util/collect.js';
import { apportion, cents, ZERO, type Cents } from '../../util/money.js';
import type { Entitlement } from '../product/entitlement.js';
import { isUnlimited, type Product } from '../product/product.js';
import type { Visit } from '../visit/visit.js';

/**
 * Turning what was sold into what a day was worth. The finance office wants one
 * number per operating day and the point of sale gives one number per sale, and
 * those two are not the same shape at all.
 *
 * The rule the area settled on: a sale is worth what it was worth on the days
 * it was actually used, spread evenly unless something says otherwise, and a
 * sale nobody ever used is worth nothing on any day. That last part is why
 * unsold value is reported separately rather than quietly dropped: an unused
 * ticket is real money the area kept and the day report must not claim it.
 */

export interface DayValue {
  readonly date: OperatingDate;
  readonly entitlementId: string;
  readonly productCode: string;
  readonly guestId: string;
  readonly value: Cents;
  readonly weight: number;
}

export interface AttributionResult {
  readonly lines: readonly DayValue[];
  /** Money on entitlements that were never used on any day. */
  readonly unusedValue: Cents;
  readonly unusedEntitlements: readonly string[];
}

export type WeightRule = (visit: Visit) => number;

/** Every day the pass was used counts the same, which is the default. */
export const evenWeight: WeightRule = () => 1;

export interface AttributionOptions {
  readonly weight?: WeightRule | undefined;
  /**
   * Days a season pass is assumed to be worth spreading over when the season is
   * not finished. Only used by the running total, never by the final figure.
   */
  readonly assumedSeasonDays?: number | undefined;
}

/**
 * Spread one entitlement over the days its holder actually skied. The parts are
 * exact: the apportionment is largest remainder, so they add back to the price
 * paid with no cent left over.
 */
export function attributeEntitlement(
  entitlement: Entitlement,
  product: Product,
  visits: readonly Visit[],
  options: AttributionOptions = {},
): DayValue[] {
  const own = [...visits]
    .filter((visit) => visit.entitlementId === entitlement.id)
    .sort((a, b) => a.operatingDate.localeCompare(b.operatingDate));
  if (own.length === 0) return [];

  const weightOf = options.weight ?? evenWeight;
  const weights = own.map((visit) => Math.max(0, weightOf(visit)));
  const parts = apportion(entitlement.pricePaid, weights);

  return own.map((visit, index) => ({
    date: visit.operatingDate,
    entitlementId: entitlement.id,
    productCode: product.code,
    guestId: visit.guestId,
    value: parts[index] ?? ZERO,
    weight: weights[index] ?? 0,
  }));
}

export interface AttributionInput {
  readonly entitlements: readonly Entitlement[];
  readonly products: { find(code: string): Product | undefined };
  readonly visits: readonly Visit[];
}

export function attributeAll(
  input: AttributionInput,
  options: AttributionOptions = {},
): AttributionResult {
  const byEntitlement = groupBy(input.visits, (visit) => visit.entitlementId);
  const lines: DayValue[] = [];
  const unused: string[] = [];
  let unusedValue = 0;

  for (const entitlement of input.entitlements) {
    const product = input.products.find(entitlement.productCode);
    if (product === undefined) continue;
    const own = byEntitlement.get(entitlement.id) ?? [];
    if (own.length === 0) {
      unused.push(entitlement.id);
      unusedValue += entitlement.pricePaid;
      continue;
    }
    lines.push(...attributeEntitlement(entitlement, product, own, options));
  }

  return {
    lines: lines.sort(
      (a, b) => a.date.localeCompare(b.date) || a.entitlementId.localeCompare(b.entitlementId),
    ),
    unusedValue: cents(unusedValue),
    unusedEntitlements: unused.sort(),
  };
}

export function valueOnDate(result: AttributionResult, date: OperatingDate): Cents {
  return cents(
    sumBy(
      result.lines.filter((line) => line.date === date),
      (line) => line.value,
    ),
  );
}

export function valueByDate(result: AttributionResult): Map<OperatingDate, Cents> {
  const totals = new Map<OperatingDate, Cents>();
  for (const [date, own] of groupBy(result.lines, (line) => line.date)) {
    totals.set(date, cents(sumBy(own, (line) => line.value)));
  }
  return totals;
}

export function valueByProduct(result: AttributionResult): Map<string, Cents> {
  const totals = new Map<string, Cents>();
  for (const [code, own] of groupBy(result.lines, (line) => line.productCode)) {
    totals.set(code, cents(sumBy(own, (line) => line.value)));
  }
  return totals;
}

/** What a season pass is worth per visit, once the season is over. */
export function costPerVisit(entitlement: Entitlement, product: Product, visits: number): Cents {
  if (visits <= 0) return ZERO;
  if (!isUnlimited(product) && visits > product.dayCount) return ZERO;
  return cents(Math.round(entitlement.pricePaid / visits));
}
