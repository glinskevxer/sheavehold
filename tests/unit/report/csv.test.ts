import { describe, expect, it } from 'vitest';
import { buildDailyReport } from '../../../src/report/daily.js';
import {
  renderDailyCsv,
  renderHourCsv,
  renderLiftCsv,
  renderSummaryCsv,
} from '../../../src/report/csv.js';
import { parseCsvTable } from '../../../src/util/csv.js';
import { expect as expectOk } from '../../../src/util/result.js';
import { reportContext } from '../../support/report.js';
import { day } from '../../support/season.js';

const report = (date = '2025-01-13') => buildDailyReport(day(date), reportContext());

describe('the lift table', () => {
  it('reads back through the csv reader', () => {
    const table = expectOk(parseCsvTable(renderLiftCsv(report())), 'csv');
    expect(table.header[0]).toBe('date');
    expect(table.records).toHaveLength(6);
  });

  it('carries the date on every row', () => {
    const table = expectOk(parseCsvTable(renderLiftCsv(report())), 'csv');
    expect(table.records.every((record) => record.values.date === '2025-01-13')).toBe(true);
  });

  it('writes numbers with no grouping', () => {
    const table = expectOk(parseCsvTable(renderLiftCsv(report())), 'csv');
    expect(table.records[0]?.values.vertical_ft).toBe('3720');
  });

  it('says turned yes or no rather than leaving it blank', () => {
    const table = expectOk(parseCsvTable(renderLiftCsv(report())), 'csv');
    expect(table.records[0]?.values.turned).toBe('yes');
    expect(table.records[2]?.values.turned).toBe('no');
    expect(table.records[2]?.values.rides).toBe('0');
  });

  it('quotes a lift name with a comma in it', () => {
    const built = report();
    const withComma = { ...built, lifts: [{ ...built.lifts[0]!, name: 'Sunburst, upper' }] };
    expect(renderLiftCsv(withComma)).toContain('"Sunburst, upper"');
  });
});

describe('the hourly table', () => {
  it('gives one row per hour with a label', () => {
    const table = expectOk(parseCsvTable(renderHourCsv(report())), 'csv');
    expect(table.records).toHaveLength(2);
    expect(table.records[0]?.values.label).toBe('10:00');
    expect(table.records[0]?.values.hour).toBe('6');
  });

  it('writes just the header for a day nobody skied', () => {
    expect(renderHourCsv(report('2025-01-14'))).toBe('date,hour,label,rides,riders,vertical_ft');
  });
});

describe('the summary table', () => {
  it('writes money in cents', () => {
    const table = expectOk(parseCsvTable(renderSummaryCsv([report()])), 'csv');
    expect(table.records[0]?.values.revenue_cents).toBe('124400');
    expect(table.records[0]?.values.revenue_per_visit_cents).toBe('62200');
  });

  it('carries the schedule and the counts', () => {
    const table = expectOk(parseCsvTable(renderSummaryCsv([report()])), 'csv');
    expect(table.records[0]?.values).toMatchObject({
      status: 'scheduled',
      day_class: 'midweek',
      scheduled_minutes: '420',
      skier_visits: '2',
      rides: '5',
      lifts_turning: '2',
      open_exceptions: '1',
    });
  });

  it('takes several days in one table', () => {
    const table = expectOk(
      parseCsvTable(renderSummaryCsv([report('2025-01-13'), report('2025-01-14')])),
      'csv',
    );
    expect(table.records.map((record) => record.values.date)).toEqual(['2025-01-13', '2025-01-14']);
  });
});

describe('the bundle', () => {
  it('gives all three tables', () => {
    const bundle = renderDailyCsv(report());
    expect(bundle.summary.split('\n')).toHaveLength(2);
    expect(bundle.lifts.split('\n')).toHaveLength(7);
    expect(bundle.hours.split('\n')).toHaveLength(3);
  });
});
