import { describe, expect, it } from 'vitest';
import { buildDailyReport } from '../../../src/report/daily.js';
import { renderDailyReport, renderDailyReportText } from '../../../src/report/text.js';
import { PRINTER_WIDTH } from '../../../src/util/table.js';
import { reportContext } from '../../support/report.js';
import { day } from '../../support/season.js';

const report = (date = '2025-01-13') => buildDailyReport(day(date), reportContext());

describe('the printed sheet', () => {
  it('opens with a heading and a rule', () => {
    const lines = renderDailyReportText(report());
    expect(lines[0]).toContain('sheavehold daily operations  2025-01-13');
    expect(lines[1]).toBe('='.repeat(PRINTER_WIDTH));
  });

  it('puts the one line summary near the top', () => {
    expect(renderDailyReportText(report())[3]).toBe('2025-01-13: 2 visits, 5 rides, 2 lifts');
  });

  it('says when the lifts ran', () => {
    expect(renderDailyReportText(report())[4]).toContain('MST to');
  });

  it('lays the headline out as aligned pairs', () => {
    const lines = renderDailyReportText(report());
    const visits = lines.find((line) => line.startsWith('skier visits'));
    expect(visits).toBe('skier visits     2');
  });

  it('prints a lift table with the columns in the agreed order', () => {
    const lines = renderDailyReportText(report());
    const header = lines[lines.indexOf('lifts') + 1];
    expect(header).toBe('  lift   name               rides  riders  vertical  share  peak hour');
  });

  it('marks a lift that did not turn with a dot rather than a zero', () => {
    const lines = renderDailyReportText(report());
    const bowl = lines.find((line) => line.includes('North Bowl'));
    expect(bowl?.trim().split(/\s+/)).toEqual(['BOWL', 'North', 'Bowl', '.', '.', '.', '.', '.']);
  });

  it('prints the hourly table with labels from the rollover', () => {
    const lines = renderDailyReportText(report());
    const header = lines.indexOf('by the hour');
    expect(lines[header + 1]).toBe('  hour   rides  riders  vertical');
    expect(lines[header + 3]).toContain('10:00');
  });

  it('names the lifts that did not turn', () => {
    const lines = renderDailyReportText(report());
    expect(lines.some((line) => line === 'lifts that did not turn: BOWL, CRPT, POMA, RIDGE')).toBe(
      true,
    );
  });

  it('says how many exceptions are open', () => {
    const lines = renderDailyReportText(report());
    expect(lines.some((line) => line === '1 exceptions are open, 0 of them serious')).toBe(true);
  });

  it('closes with the revenue and when it was printed', () => {
    const lines = renderDailyReportText(report());
    expect(lines[lines.length - 2]).toContain('revenue $');
    expect(lines[lines.length - 1]).toBe('printed 2025-01-14 08:00:00 MST');
  });

  it('never runs past the printer width', () => {
    for (const line of renderDailyReportText(report())) {
      expect(line.length).toBeLessThanOrEqual(PRINTER_WIDTH);
    }
  });

  it('prints a quiet day without the exception or idle sections', () => {
    const lines = renderDailyReportText(report('2025-01-14'));
    expect(lines.some((line) => line.startsWith('lifts that did not turn'))).toBe(true);
    expect(lines.some((line) => line.includes('exceptions are open'))).toBe(true);
  });

  it('joins into one string', () => {
    expect(renderDailyReport(report()).split('\n')).toEqual(renderDailyReportText(report()));
  });
});
