import { operatingDateRange, type OperatingDate } from '../util/clock.js';
import { groupBy, sumBy } from '../util/collect.js';
import { formatMoney, cents, ZERO, type Cents } from '../util/money.js';
import { indent, renderTable, type Column } from '../util/table.js';
import type { RevenueContext } from '../service/revenue.js';
import { productRevenue } from '../service/revenue.js';
import type { RideStore } from '../storage/repository/rides.js';

/**
 * Which products the visits came on, and what each one was worth. Marketing
 * reads the visit column, finance reads the money column, and they disagree
 * every year because the two do not rank the same way: comps and employee
 * passes are a real share of the visits and none of the money.
 *
 * So both columns are here, side by side, and neither is called the headline.
 */

export interface ProductMixRow {
  readonly productCode: string;
  readonly productName: string;
  readonly kind: string;
  readonly visits: number;
  readonly visitShare: number;
  readonly rides: number;
  readonly verticalFt: number;
  readonly value: Cents;
  readonly valueShare: number;
  readonly perVisit: Cents;
}

export interface ProductMixReport {
  readonly from: OperatingDate;
  readonly to: OperatingDate;
  readonly rows: readonly ProductMixRow[];
  readonly totalVisits: number;
  readonly totalValue: Cents;
}

function share(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export interface ProductMixContext extends RevenueContext {
  readonly rides: RideStore;
}

export function buildProductMix(
  from: OperatingDate,
  to: OperatingDate,
  context: ProductMixContext,
): ProductMixReport {
  const dates = new Set<string>(operatingDateRange(from, to));
  const visits = context.rides.visits.all().filter((visit) => dates.has(visit.operatingDate));
  const revenue = new Map(productRevenue(context).map((row) => [row.productCode, row]));

  const totalVisits = visits.length;
  const totalValue = sumBy([...revenue.values()], (row) => row.value);

  const rows: ProductMixRow[] = [];
  for (const [code, own] of groupBy(visits, (visit) => visit.productCode)) {
    const product = context.reference.findProduct(code);
    const value = revenue.get(code)?.value ?? ZERO;
    rows.push({
      productCode: code,
      productName: product?.name ?? 'unknown product',
      kind: product?.kind ?? 'unknown',
      visits: own.length,
      visitShare: share(own.length, totalVisits),
      rides: sumBy(own, (visit) => visit.rideCount),
      verticalFt: sumBy(own, (visit) => visit.verticalFt),
      value,
      valueShare: share(value, totalValue),
      perVisit: own.length === 0 ? ZERO : cents(Math.round(value / own.length)),
    });
  }

  rows.sort((a, b) => b.visits - a.visits || a.productCode.localeCompare(b.productCode));
  return { from, to, rows, totalVisits, totalValue: cents(totalValue) };
}

const columns: Column<ProductMixRow>[] = [
  { header: 'product', value: (row) => row.productCode },
  { header: 'name', maxWidth: 22, value: (row) => row.productName },
  { header: 'kind', value: (row) => row.kind },
  { header: 'visits', align: 'right', value: (row) => String(row.visits) },
  { header: 'visit_pc', align: 'right', value: (row) => String(row.visitShare) },
  { header: 'value', align: 'right', value: (row) => formatMoney(row.value) },
  { header: 'value_pc', align: 'right', value: (row) => String(row.valueShare) },
  { header: 'per_visit', align: 'right', value: (row) => formatMoney(row.perVisit) },
];

export function renderProductMix(report: ProductMixReport): string[] {
  return [
    `product mix  ${report.from} to ${report.to}`,
    '',
    ...indent(renderTable(report.rows, columns)),
    '',
    `${report.totalVisits} visits worth ${formatMoney(report.totalValue)}`,
  ];
}

/** Products that are a bigger share of the visits than of the money. */
export function underEarning(report: ProductMixReport): ProductMixRow[] {
  return report.rows.filter((row) => row.visitShare > row.valueShare + 1);
}
