import { describe, expect, it } from 'vitest';
import { recomputeDate } from '../../src/service/recompute.js';
import { scanDateForExceptions } from '../../src/service/exceptions.js';
import { checkIntegrity } from '../../src/storage/integrity.js';
import { buildDailyReport } from '../../src/report/daily.js';
import { renderDailyReportText } from '../../src/report/text.js';
import { ExceptionRegister } from '../../src/domain/exception/register.js';
import { directory } from '../support/guests.js';
import { CARD_IDA, CARD_MILO, CARD_ROW, CARD_TESS } from '../support/media.js';
import { harness } from '../support/service.js';
import { day } from '../support/season.js';
import { transferMap } from '../support/transfers.js';

/**
 * One operating day, from four gate uploads through to the printed sheet, with
 * nothing stubbed between them. Every number asserted here is one somebody in
 * the ops office would read off the wall, and the point of the test is that
 * they all come out of the same run.
 */

function skiDay() {
  const system = harness();

  // Sunburst: two guests lapping, one of them handing the card over.
  system.ingest(
    [
      { at: '2025-01-13T16:05:00Z', seq: 1, media: CARD_ROW },
      { at: '2025-01-13T16:05:04Z', seq: 2, media: CARD_ROW },
      { at: '2025-01-13T16:22:00Z', seq: 3, media: CARD_ROW },
      { at: '2025-01-13T16:26:00Z', seq: 4, media: CARD_ROW },
      { at: '2025-01-13T17:40:00Z', seq: 5, media: CARD_ROW },
      { at: '2025-01-13T16:12:00Z', seq: 6, media: CARD_MILO },
    ],
    { batch: 'up-sunb', terminal: 'SUNB.01' },
  );

  // The beginner lifts.
  system.ingest(
    [
      { at: '2025-01-13T16:30:00Z', seq: 1, terminal: 'MEADW.01', media: CARD_TESS },
      { at: '2025-01-13T17:10:00Z', seq: 2, terminal: 'MEADW.01', media: CARD_TESS },
      { at: '2025-01-13T17:15:00Z', seq: 3, terminal: 'MEADW.01', media: CARD_IDA },
    ],
    { batch: 'up-meadw', terminal: 'MEADW.01' },
  );

  // The gondola, with two quick laps that mean a mid station unload.
  system.ingest(
    [
      { at: '2025-01-13T18:00:00Z', seq: 1, terminal: 'RIDGE.01', media: CARD_ROW },
      { at: '2025-01-13T18:12:00Z', seq: 2, terminal: 'RIDGE.01', media: CARD_ROW },
    ],
    { batch: 'up-ridge', terminal: 'RIDGE.01' },
  );

  // A gate that was never let on: the beginner ticket at the wrong lift.
  system.ingest([{ at: '2025-01-13T19:00:00Z', seq: 1, terminal: 'BOWL.01', media: CARD_MILO }], {
    batch: 'up-bowl',
    terminal: 'BOWL.01',
  });

  return system;
}

describe('one whole operating day', () => {
  const date = day('2025-01-13');

  it('takes every upload in', () => {
    const system = skiDay();
    expect(system.scans.batches.size).toBe(4);
    expect(system.scans.refusedBatches()).toEqual([]);
    expect(system.scans.countOnDate(date)).toBe(12);
  });

  it('suppresses the double read and turns the rest into rides', () => {
    const system = skiDay();
    const result = recomputeDate(date, system);
    expect(result.suppressed).toBe(1);
    expect(result.rides).toHaveLength(9);
    expect(result.turnedAway).toBe(2);
    expect([...result.rejections]).toEqual([['lift_not_in_scope', 2]]);
  });

  it('credits the mid station on the quick gondola lap', () => {
    const system = skiDay();
    const result = recomputeDate(date, system);
    expect(result.midStationAdjustments).toHaveLength(1);
    const gondola = result.rides.filter((ride) => ride.lift === 'RIDGE');
    expect(gondola.map((ride) => ride.verticalFt)).toEqual([1060, 1880]);
  });

  it('counts three skier visits and their vertical', () => {
    const system = skiDay();
    recomputeDate(date, system);
    expect(system.rides.skierVisitsOn(date)).toBe(3);
    expect(system.rides.verticalOn(date)).toBe(1240 * 4 + 1060 + 1880 + 380 * 3);
  });

  it('finds the pass-back and nothing else', () => {
    const system = skiDay();
    recomputeDate(date, system);
    const register = new ExceptionRegister();
    const found = scanDateForExceptions(date, {
      rides: system.rides,
      register,
      lifts: system.lifts,
      transfers: transferMap(),
      guests: directory(),
    });
    expect(found.found).toBe(2);
    expect(register.all().every((row) => row.kind === 'passback_same_lift')).toBe(true);
    expect(new Set(register.all().map((row) => row.subject)).size).toBe(1);
  });

  it('leaves the store consistent', () => {
    const system = skiDay();
    recomputeDate(date, system);
    const report = checkIntegrity({
      reference: system.reference,
      scans: system.scans,
      rides: system.rides,
    });
    expect(report.healthy).toBe(true);
  });

  it('prints a sheet with the same numbers on it', () => {
    const system = skiDay();
    recomputeDate(date, system);
    const register = new ExceptionRegister();
    scanDateForExceptions(date, {
      rides: system.rides,
      register,
      lifts: system.lifts,
      transfers: transferMap(),
      guests: directory(),
    });
    const report = buildDailyReport(date, {
      rides: system.rides,
      scans: system.scans,
      calendar: system.calendar,
      lifts: system.lifts,
      reference: system.reference,
      register,
      generatedAt: new Date('2025-01-14T15:00:00Z'),
    });
    const lines = renderDailyReportText(report);
    expect(lines.some((line) => line.includes('2025-01-13: 3 visits, 9 rides, 3 lifts'))).toBe(
      true,
    );
    expect(lines.some((line) => line.startsWith('skier visits') && line.includes('3'))).toBe(true);
    expect(lines.some((line) => line.includes('2 exceptions are open'))).toBe(true);
  });

  it('reads the same after a second upload of the same files', () => {
    const system = skiDay();
    recomputeDate(date, system);
    const before = system.rides.rides.size;
    system.ingest(
      [
        { at: '2025-01-13T16:05:00Z', seq: 1, media: CARD_ROW },
        { at: '2025-01-13T16:05:04Z', seq: 2, media: CARD_ROW },
        { at: '2025-01-13T16:22:00Z', seq: 3, media: CARD_ROW },
        { at: '2025-01-13T16:26:00Z', seq: 4, media: CARD_ROW },
        { at: '2025-01-13T17:40:00Z', seq: 5, media: CARD_ROW },
        { at: '2025-01-13T16:12:00Z', seq: 6, media: CARD_MILO },
      ],
      { batch: 'up-sunb', terminal: 'SUNB.01' },
    );
    recomputeDate(date, system);
    expect(system.scans.countOnDate(date)).toBe(12);
    expect(system.rides.rides.size).toBe(before);
  });
});
