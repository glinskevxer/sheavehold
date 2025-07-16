import { hourLabel } from '../domain/capacity/capacity.js';
import { formatMoney } from '../util/money.js';
import type { DailyReport } from './daily.js';

/**
 * The json shape the api hands out and the marketing site pulls. It is not the
 * internal report object: that carries Date values and branded strings that
 * mean nothing over the wire, and it changes whenever the internals do.
 *
 * So this is a deliberate, versioned wire shape with a flat set of keys, and
 * changing one is a breaking change to anybody consuming it.
 */

export const REPORT_WIRE_VERSION = 2;

export interface DailyReportJson {
  readonly version: number;
  readonly date: string;
  readonly generatedAt: string;
  readonly status: string;
  readonly dayClass: string;
  readonly totals: {
    readonly skierVisits: number;
    readonly visits: number;
    readonly rides: number;
    readonly verticalFt: number;
    readonly scans: number;
    readonly liftsTurning: number;
    readonly ridesPerVisit: number;
    readonly verticalPerVisit: number;
  };
  readonly utilisation: {
    readonly percent: number;
    readonly designCapacity: number;
    readonly theoreticalCapacity: number;
    readonly scheduledMinutes: number;
  };
  readonly revenue: {
    readonly cents: number;
    readonly formatted: string;
    readonly perVisitCents: number;
  };
  readonly exceptions: { readonly open: number; readonly high: number };
  readonly lifts: readonly {
    readonly code: string;
    readonly name: string;
    readonly turned: boolean;
    readonly rides: number;
    readonly riders: number;
    readonly verticalFt: number;
    readonly sharePercent: number;
  }[];
  readonly hours: readonly {
    readonly hour: number;
    readonly label: string;
    readonly rides: number;
    readonly riders: number;
    readonly verticalFt: number;
  }[];
}

export function toDailyReportJson(report: DailyReport): DailyReportJson {
  return {
    version: REPORT_WIRE_VERSION,
    date: report.date,
    generatedAt: report.generatedAt.toISOString(),
    status: report.summary.status,
    dayClass: report.summary.dayClass,
    totals: {
      skierVisits: report.summary.skierVisits,
      visits: report.summary.visits,
      rides: report.summary.rides,
      verticalFt: report.summary.verticalFt,
      scans: report.summary.scans,
      liftsTurning: report.summary.liftsTurning,
      ridesPerVisit: report.summary.ridesPerVisit,
      verticalPerVisit: report.summary.verticalPerVisit,
    },
    utilisation: {
      percent: report.utilisation.utilisationPercent,
      designCapacity: report.utilisation.designCapacity,
      theoreticalCapacity: report.utilisation.theoreticalCapacity,
      scheduledMinutes: report.utilisation.scheduledMinutes,
    },
    revenue: {
      cents: report.revenue,
      formatted: formatMoney(report.revenue),
      perVisitCents: report.revenuePerVisit,
    },
    exceptions: { open: report.openExceptions, high: report.highExceptions },
    lifts: report.lifts.map((row) => ({
      code: row.lift,
      name: row.name,
      turned: row.turned,
      rides: row.rides,
      riders: row.riders,
      verticalFt: row.verticalFt,
      sharePercent: row.shareOfRides,
    })),
    hours: report.hourly.map((bucket) => ({
      hour: bucket.hour,
      label: hourLabel(bucket.hour),
      rides: bucket.rides,
      riders: bucket.riders,
      verticalFt: bucket.verticalFt,
    })),
  };
}

export function renderDailyJson(report: DailyReport, pretty = false): string {
  return JSON.stringify(toDailyReportJson(report), null, pretty ? 2 : 0);
}
