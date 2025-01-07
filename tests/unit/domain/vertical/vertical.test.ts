import { describe, expect, it } from 'vitest';
import {
  cumulativeVertical,
  guestDayVertical,
  implausibleDays,
  IMPLAUSIBLE_DAILY_VERTICAL_FT,
  leaderboard,
  shareOfVertical,
  totalVertical,
  verticalByDate,
  verticalByGuest,
  verticalByLift,
  verticalByProduct,
  verticalPerHour,
} from '../../../../src/domain/vertical/vertical.js';
import { parseLiftCode } from '../../../../src/util/ids.js';
import { expect as expectOk } from '../../../../src/util/result.js';
import { CARD_IDA, CARD_TESS } from '../../../support/media.js';
import { ridesFrom, type ScanSpec } from '../../../support/pipeline.js';
import { day } from '../../../support/season.js';

const lift = (raw: string) => expectOk(parseLiftCode(raw), 'lift');

function at(minutes: number, overrides: Partial<ScanSpec> = {}): ScanSpec {
  const base = new Date('2025-01-13T16:00:00Z').getTime();
  return { at: new Date(base + minutes * 60_000).toISOString(), ...overrides };
}

const sample = () => [
  ...ridesFrom([
    at(0, { terminal: 'SUNB.01' }),
    at(30, { terminal: 'RIDGE.01' }),
    at(60, { terminal: 'SUNB.01' }),
  ]),
  ...ridesFrom([at(10, { media: CARD_TESS, terminal: 'MEADW.01' })]),
  ...ridesFrom([at(20, { media: CARD_IDA, terminal: 'MEADW.01' })]),
  ...ridesFrom([{ at: '2025-01-14T17:00:00Z', terminal: 'SUNB.01' }]),
];

describe('adding vertical up', () => {
  it('totals every ride', () => {
    expect(totalVertical(sample())).toBe(1240 * 3 + 1880 + 380 * 2);
  });

  it('groups by guest, biggest first', () => {
    const rows = verticalByGuest(sample());
    expect(rows[0]?.key).toBe('G-77');
    expect(rows[0]?.rideCount).toBe(4);
    expect(rows.map((row) => row.key)).toEqual(['G-77', 'G-78', 'G-91']);
  });

  it('groups by lift and by product', () => {
    expect(verticalByLift(sample()).map((row) => row.key)).toEqual(['SUNB', 'RIDGE', 'MEADW']);
    expect(verticalByProduct(sample()).map((row) => row.key)).toEqual(['SEAS', 'A3DAY', 'SEASMW']);
  });

  it('groups by date in date order', () => {
    expect(verticalByDate(sample()).map((row) => row.key)).toEqual(['2025-01-13', '2025-01-14']);
  });

  it('answers for one guest on one day', () => {
    expect(guestDayVertical(sample(), 'G-77', day('2025-01-13'))).toBe(1240 * 2 + 1880);
    expect(guestDayVertical(sample(), 'G-77', day('2025-01-14'))).toBe(1240);
    expect(guestDayVertical(sample(), 'G-000', day('2025-01-13'))).toBe(0);
  });

  it('gives a running total per day', () => {
    const rows = cumulativeVertical(sample(), 'G-77');
    expect(rows.map((row) => row.key)).toEqual(['2025-01-13', '2025-01-14']);
    expect(rows[0]?.verticalFt).toBe(1240 * 2 + 1880);
    expect(rows[1]?.verticalFt).toBe(1240 * 3 + 1880);
    expect(rows[1]?.rideCount).toBe(4);
    expect(cumulativeVertical(sample(), 'G-000')).toEqual([]);
  });

  it('gives a share of the day per lift', () => {
    expect(shareOfVertical(sample(), lift('RIDGE'))).toBe(29.6);
    expect(shareOfVertical(sample(), lift('BOWL'))).toBe(0);
    expect(shareOfVertical([], lift('SUNB'))).toBe(0);
  });
});

describe('the leaderboard', () => {
  it('ranks guest days by vertical', () => {
    const board = leaderboard(sample());
    expect(board[0]).toMatchObject({ guestId: 'G-77', date: '2025-01-13', rideCount: 3, lifts: 2 });
    expect(board).toHaveLength(4);
  });

  it('takes a limit', () => {
    expect(leaderboard(sample(), { limit: 2 })).toHaveLength(2);
    expect(leaderboard(sample(), { limit: 0 })).toEqual([]);
  });

  it('caps a day nobody could have skied and marks it', () => {
    const board = leaderboard(sample(), { dailyCapFt: 2_000 });
    expect(board[0]?.verticalFt).toBe(2_000);
    expect(board[0]?.capped).toBe(true);
    expect(implausibleDays(sample(), { dailyCapFt: 1_000 })).toHaveLength(2);
  });

  it('leaves an ordinary season under the standing cap', () => {
    expect(implausibleDays(sample())).toEqual([]);
    expect(IMPLAUSIBLE_DAILY_VERTICAL_FT).toBe(90_000);
  });

  it('gives nothing back for no rides', () => {
    expect(leaderboard([])).toEqual([]);
  });
});

describe('vertical per hour', () => {
  it('divides the day by the span between the first and last ride', () => {
    const rides = ridesFrom([at(0, { terminal: 'SUNB.01' }), at(60, { terminal: 'SUNB.01' })]);
    expect(verticalPerHour(rides)).toBe(2480);
  });

  it('answers nothing for a single ride or an instant day', () => {
    expect(verticalPerHour(ridesFrom([at(0)]))).toBe(0);
    expect(verticalPerHour([])).toBe(0);
  });
});
