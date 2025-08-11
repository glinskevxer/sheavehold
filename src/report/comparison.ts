import { addOperatingDays, operatingDaysBetween, type OperatingDate } from '../util/clock.js';
import { renderDocument, pairsSection, type ReportDocument } from './writer.js';
import { buildSeasonReport, type SeasonContext, type SeasonReport } from './season.js';

/**
 * This season against last. The comparison is aligned on the day number in the
 * season, not on the calendar date, because opening a week earlier than last
 * year makes every calendar aligned figure look like a collapse.
 *
 * A change is only reported when both sides have something to compare. Last
 * season having no data for a day is not a hundred percent improvement, and
 * printing it as one is how the board got told visits had tripled.
 */

export interface Change {
  readonly label: string;
  readonly now: number;
  readonly before: number;
  readonly delta: number;
  readonly percent: number | undefined;
}

export interface ComparisonReport {
  readonly current: SeasonReport;
  readonly previous: SeasonReport;
  readonly alignedDays: number;
  readonly changes: readonly Change[];
}

function change(label: string, now: number, before: number): Change {
  return {
    label,
    now,
    before,
    delta: now - before,
    percent: before === 0 ? undefined : Math.round(((now - before) / before) * 1000) / 10,
  };
}

/**
 * Line the two periods up by length rather than by date. The earlier period
 * runs from its own opening for as many days as the current one has run.
 */
export function alignedPeriod(
  currentFrom: OperatingDate,
  currentTo: OperatingDate,
  previousFrom: OperatingDate,
): { from: OperatingDate; to: OperatingDate; days: number } {
  const days = operatingDaysBetween(currentFrom, currentTo);
  return {
    from: previousFrom,
    to: addOperatingDays(previousFrom, Math.max(0, days)),
    days: days + 1,
  };
}

export function buildComparison(
  from: OperatingDate,
  to: OperatingDate,
  previousFrom: OperatingDate,
  context: SeasonContext,
  previousContext: SeasonContext = context,
): ComparisonReport {
  const aligned = alignedPeriod(from, to, previousFrom);
  const current = buildSeasonReport(from, to, context);
  const previous = buildSeasonReport(aligned.from, aligned.to, previousContext);

  return {
    current,
    previous,
    alignedDays: aligned.days,
    changes: [
      change('skier visits', current.skierVisits, previous.skierVisits),
      change('rides', current.rides, previous.rides),
      change('vertical feet', current.verticalFt, previous.verticalFt),
      change('days with traffic', current.daysOpen, previous.daysOpen),
      change('days lost', current.daysLost, previous.daysLost),
      change('revenue', current.revenue, previous.revenue),
    ],
  };
}

function describe(entry: Change): string {
  const direction = entry.delta >= 0 ? 'up' : 'down';
  if (entry.percent === undefined) return `${entry.now} against nothing last time`;
  return `${entry.now} against ${entry.before}, ${direction} ${Math.abs(entry.percent)}%`;
}

export function comparisonDocument(report: ComparisonReport): ReportDocument {
  return {
    title: `season comparison  ${report.current.from} to ${report.current.to}`,
    subtitle: `against ${report.previous.from} to ${report.previous.to}, ${report.alignedDays} days each`,
    sections: [
      pairsSection(report.changes.map((entry) => [entry.label, describe(entry)] as const)),
    ],
  };
}

export function renderComparison(report: ComparisonReport): string[] {
  return renderDocument(comparisonDocument(report));
}

/** Changes worth putting in the email, which is anything past a tenth. */
export function notableChanges(report: ComparisonReport, threshold = 10): Change[] {
  return report.changes.filter(
    (entry) => entry.percent !== undefined && Math.abs(entry.percent) >= threshold,
  );
}
