import { describe, expect, it } from 'vitest';
import { buildMorningSheet, renderMorningSheet } from '../../../src/report/morning.js';
import { ClockBook } from '../../../src/domain/scan/clock-skew.js';
import { GENERATED_AT, reportContext } from '../../support/report.js';
import { handshake } from '../../support/scans.js';
import { day } from '../../support/season.js';

function contextOf(clocks = new ClockBook()) {
  const report = reportContext();
  return {
    report,
    season: report,
    clocks,
    seasonOpensOn: day('2024-11-22'),
    generatedAt: GENERATED_AT,
  };
}

const sheet = (date = '2025-01-14', clocks = new ClockBook()) =>
  buildMorningSheet(day(date), contextOf(clocks));

describe('the morning sheet', () => {
  it('reports on yesterday, not today', () => {
    const built = sheet();
    expect(built.date).toBe('2025-01-14');
    expect(built.yesterday).toBe('2025-01-13');
    expect(built.lines.some((line) => line.includes('2025-01-13: 2 visits'))).toBe(true);
  });

  it('opens with the title and when it was printed', () => {
    const built = sheet();
    expect(built.lines[0]).toBe('sheavehold morning sheet  2025-01-14');
    expect(built.lines[1]).toBe('2025-01-14 08:00:00 MST');
  });

  it('prints four sections in the order the manager reads them', () => {
    const built = sheet();
    expect(built.lines.filter((line) => !line.startsWith(' ') && line !== '')).toEqual([
      'sheavehold morning sheet  2025-01-14',
      '2025-01-14 08:00:00 MST',
      'yesterday',
      'yesterday in numbers',
      'season to date',
      'needs attention',
    ]);
  });

  it('puts yesterday numbers and season numbers on it', () => {
    const built = sheet();
    expect(built.lines.some((line) => line.includes('skier visits'))).toBe(true);
    expect(built.lines.some((line) => line.includes('days lost'))).toBe(true);
  });

  it('lists the lifts that carried nobody', () => {
    expect(sheet().needsAttention).toContain('BOWL carried nobody yesterday');
  });

  it('lists a gate whose clock needs a work order', () => {
    const clocks = ClockBook.from([
      handshake('SUNB.01', '2025-01-13T11:00:00Z', '2015-01-13T11:00:00Z'),
    ]);
    expect(sheet('2025-01-14', clocks).needsAttention).toContain(
      'gate SUNB.01 has a clock worth a work order',
    );
  });

  it('says nothing needs attention when nothing does', () => {
    const built = sheet('2025-01-12');
    expect(built.lines.some((line) => line.trim() === 'nothing')).toBe(true);
  });

  it('mentions the open exceptions', () => {
    expect(sheet().lines.some((line) => line.includes('open exceptions'))).toBe(true);
  });

  it('joins into one page', () => {
    const built = sheet();
    expect(renderMorningSheet(built)).toBe(built.lines.join('\n'));
  });
});
