import { addOperatingDays, formatAreaTime, type OperatingDate } from '../util/clock.js';
import { formatMoney } from '../util/money.js';
import type { ClockBook } from '../domain/scan/clock-skew.js';
import { buildDailyReport, oneLine, type DailyReportContext } from './daily.js';
import { buildExceptionReport, exceptionHeadline } from './exceptions.js';
import { buildSeasonReport, type SeasonContext } from './season.js';
import { linesSection, pairsSection, renderDocument, type ReportDocument } from './writer.js';

/**
 * One page, printed at six in the morning, that the duty manager reads
 * standing up with a coffee. It is the only report anybody reads every day, so
 * it has a hard rule: nothing goes on it that does not change what somebody
 * does today.
 *
 * Season to date is on it because the owners ask. Utilisation is not, because
 * knowing Sunburst ran at four percent yesterday changes nothing this morning.
 */

export interface MorningSheet {
  readonly date: OperatingDate;
  readonly yesterday: OperatingDate;
  readonly lines: readonly string[];
  readonly needsAttention: readonly string[];
}

export interface MorningContext {
  readonly report: DailyReportContext;
  readonly season: SeasonContext;
  readonly clocks: ClockBook;
  readonly seasonOpensOn: OperatingDate;
  readonly generatedAt: Date;
}

export function buildMorningSheet(date: OperatingDate, context: MorningContext): MorningSheet {
  const yesterday = addOperatingDays(date, -1);
  const daily = buildDailyReport(yesterday, context.report);
  const season = buildSeasonReport(context.seasonOpensOn, yesterday, context.season);
  const exceptions = buildExceptionReport(
    context.seasonOpensOn,
    yesterday,
    context.report.register,
    yesterday,
  );

  const attention: string[] = [];
  for (const terminal of context.clocks.needingAttention()) {
    attention.push(`gate ${terminal} has a clock worth a work order`);
  }
  for (const row of daily.lifts) {
    if (!row.turned && daily.summary.status === 'scheduled') {
      attention.push(`${row.lift} carried nobody yesterday`);
    }
  }
  if (exceptions.staleCount > 0) {
    attention.push(`${exceptions.staleCount} exceptions have been open over a week`);
  }

  const document = morningDocument(date, daily, season, exceptions, attention, context.generatedAt);
  return { date, yesterday, lines: renderDocument(document), needsAttention: attention };
}

function morningDocument(
  date: OperatingDate,
  daily: ReturnType<typeof buildDailyReport>,
  season: ReturnType<typeof buildSeasonReport>,
  exceptions: ReturnType<typeof buildExceptionReport>,
  attention: readonly string[],
  generatedAt: Date,
): ReportDocument {
  return {
    title: `sheavehold morning sheet  ${date}`,
    subtitle: formatAreaTime(generatedAt),
    sections: [
      linesSection([oneLine(daily), exceptionHeadline(exceptions)], 'yesterday'),
      pairsSection(
        [
          ['skier visits', String(daily.summary.skierVisits)],
          ['rides', String(daily.summary.rides)],
          ['vertical feet', daily.summary.verticalFt.toLocaleString('en-US')],
          ['revenue', formatMoney(daily.revenue)],
        ],
        'yesterday in numbers',
      ),
      pairsSection(
        [
          ['days with traffic', String(season.daysOpen)],
          ['days lost', String(season.daysLost)],
          ['skier visits', String(season.skierVisits)],
          ['average a day', String(season.averageVisits)],
          ['revenue', formatMoney(season.revenue)],
        ],
        'season to date',
      ),
      linesSection(attention.length === 0 ? ['nothing'] : attention, 'needs attention'),
    ],
  };
}

export function renderMorningSheet(sheet: MorningSheet): string {
  return sheet.lines.join('\n');
}
