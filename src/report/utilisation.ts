import { operatingDateRange, type OperatingDate } from '../util/clock.js';
import { sumBy } from '../util/collect.js';
import type { LiftCode } from '../util/ids.js';
import { designCapacityPerHour } from '../domain/lift/lift.js';
import { areaUtilisation, pinchedHours } from '../domain/capacity/utilisation.js';
import { hourLabel } from '../domain/capacity/capacity.js';
import type { Column } from '../util/table.js';
import { renderDocument, tableSection, type ReportDocument } from './writer.js';
import type { QueryContext } from '../service/query.js';

/**
 * The utilisation report the mountain manager takes to the lift committee when
 * asking for a new chair. It answers one question: which lift is the pinch
 * point, and how often.
 *
 * Averaging utilisation over the season is the wrong answer and it is the one
 * that got asked for first. A lift at ninety percent on twelve Saturdays and
 * fifteen percent the rest of the time averages out to something nobody should
 * plan against, so the report counts pinched hours instead.
 */

export interface UtilisationRow {
  readonly lift: LiftCode;
  readonly name: string;
  readonly designPerHour: number;
  readonly daysTurning: number;
  readonly hoursTurning: number;
  readonly ridesCarried: number;
  readonly averagePercent: number;
  readonly peakPercent: number;
  readonly pinchedHours: number;
  readonly pinchedDays: number;
  readonly worstDate: OperatingDate | undefined;
}

export interface UtilisationReport {
  readonly from: OperatingDate;
  readonly to: OperatingDate;
  readonly threshold: number;
  readonly rows: readonly UtilisationRow[];
  readonly areaAverage: number;
}

export function buildUtilisationReport(
  from: OperatingDate,
  to: OperatingDate,
  context: QueryContext,
  threshold = 70,
): UtilisationReport {
  const dates = operatingDateRange(from, to);
  const rows: UtilisationRow[] = [];

  for (const lift of context.lifts.all().filter((entry) => entry.status !== 'retired')) {
    let daysTurning = 0;
    let hoursTurning = 0;
    let rides = 0;
    let design = 0;
    let peak = 0;
    let pinched = 0;
    let pinchedDays = 0;
    let worstDate: OperatingDate | undefined;
    let worstPercent = 0;

    for (const date of dates) {
      const own = context.rides.ridesOnLift(lift.code, date);
      if (own.length === 0) continue;
      const plan = context.calendar.plan(date);
      const area = areaUtilisation(date, own, context.lifts, plan);
      const row = area.lifts.find((entry) => entry.lift === lift.code);
      if (row === undefined) continue;
      daysTurning += 1;
      hoursTurning += row.hoursTurning;
      rides += row.ridesCarried;
      design += row.designCapacity;
      peak = Math.max(peak, row.peakHourPercent);
      const hours = pinchedHours(lift, own, threshold);
      pinched += hours.length;
      if (hours.length > 0) pinchedDays += 1;
      if (row.utilisationPercent > worstPercent) {
        worstPercent = row.utilisationPercent;
        worstDate = date;
      }
    }

    rows.push({
      lift: lift.code,
      name: lift.name,
      designPerHour: designCapacityPerHour(lift),
      daysTurning,
      hoursTurning,
      ridesCarried: rides,
      averagePercent: design === 0 ? 0 : Math.round((rides / design) * 1000) / 10,
      peakPercent: peak,
      pinchedHours: pinched,
      pinchedDays,
      worstDate,
    });
  }

  rows.sort((a, b) => b.pinchedHours - a.pinchedHours || b.ridesCarried - a.ridesCarried);
  const carried = sumBy(rows, (row) => row.ridesCarried);
  const capacity = sumBy(rows, (row) => row.designPerHour * row.hoursTurning);

  return {
    from,
    to,
    threshold,
    rows,
    areaAverage: capacity === 0 ? 0 : Math.round((carried / capacity) * 1000) / 10,
  };
}

const columns: Column<UtilisationRow>[] = [
  { header: 'lift', value: (row) => row.lift },
  { header: 'name', maxWidth: 20, value: (row) => row.name },
  { header: 'pph', align: 'right', value: (row) => String(row.designPerHour) },
  { header: 'days', align: 'right', value: (row) => String(row.daysTurning) },
  { header: 'hours', align: 'right', value: (row) => String(row.hoursTurning) },
  { header: 'rides', align: 'right', value: (row) => String(row.ridesCarried) },
  { header: 'avg', align: 'right', value: (row) => `${row.averagePercent}%` },
  { header: 'peak', align: 'right', value: (row) => `${row.peakPercent}%` },
  { header: 'pinched', align: 'right', value: (row) => String(row.pinchedHours) },
];

export function utilisationDocument(report: UtilisationReport): ReportDocument {
  return {
    title: `lift utilisation  ${report.from} to ${report.to}`,
    subtitle: `pinched means an hour at or above ${report.threshold}% of design capacity`,
    sections: [tableSection(report.rows, columns, { emptyNote: 'no lift turned' })],
    footer: [`area average ${report.areaAverage}% of the capacity that was turning`],
  };
}

export function renderUtilisationReport(report: UtilisationReport): string[] {
  return renderDocument(utilisationDocument(report));
}

export function pinchPoint(report: UtilisationReport): UtilisationRow | undefined {
  const [first] = report.rows;
  if (first === undefined || first.pinchedHours === 0) return undefined;
  return first;
}

export function describeWorstHour(lift: UtilisationRow): string {
  if (lift.worstDate === undefined) return `${lift.lift} never turned`;
  return `${lift.lift} was busiest on ${lift.worstDate}`;
}

export function hourLabels(hours: readonly number[]): string[] {
  return hours.map(hourLabel);
}
