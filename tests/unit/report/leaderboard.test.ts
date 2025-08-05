import { describe, expect, it } from 'vitest';
import { buildLeaderboard, renderLeaderboard } from '../../../src/report/leaderboard.js';
import { reportContext } from '../../support/report.js';
import { day } from '../../support/season.js';

function contextWith(optIn: readonly string[]) {
  const context = reportContext();
  for (const guest of context.reference.guests.all()) {
    context.reference.guests.upsert({ ...guest, marketingOptIn: optIn.includes(guest.id) });
  }
  return { reference: context.reference, rides: context.rides };
}

const report = (optIn: readonly string[] = ['G-77', 'G-78'], limit = 10) =>
  buildLeaderboard(day('2025-01-13'), day('2025-01-15'), contextWith(optIn), limit);

describe('building the leaderboard', () => {
  it('ranks the biggest single days', () => {
    const rows = report().bestDays;
    expect(rows[0]).toMatchObject({ rank: 1, guestId: 'G-77', rides: 3, date: '2025-01-13' });
    expect(rows[0]?.verticalFt).toBe(3720);
  });

  it('names the guest rather than printing an id', () => {
    expect(report().bestDays[0]?.name).toBe('Ardley, Row');
  });

  it('ranks the biggest seasons separately', () => {
    const rows = report().bestSeasons;
    expect(rows[0]).toMatchObject({ rank: 1, guestId: 'G-77', days: 1 });
    expect(rows).toHaveLength(2);
  });

  it('leaves anybody who opted out off both lists', () => {
    const built = report(['G-77']);
    expect(built.bestDays.map((row) => row.guestId)).toEqual(['G-77']);
    expect(built.bestSeasons.map((row) => row.guestId)).toEqual(['G-77']);
    expect(built.excludedForMarketing).toBe(1);
  });

  it('gives nothing when nobody opted in', () => {
    const built = report([]);
    expect(built.bestDays).toEqual([]);
    expect(built.bestSeasons).toEqual([]);
    expect(built.excludedForMarketing).toBe(2);
  });

  it('takes a limit', () => {
    expect(report(['G-77', 'G-78'], 1).bestSeasons).toHaveLength(1);
  });

  it('gives nothing for a period with no rides', () => {
    const built = buildLeaderboard(day('2025-02-01'), day('2025-02-05'), contextWith(['G-77']), 10);
    expect(built.bestDays).toEqual([]);
    expect(built.excludedForMarketing).toBe(0);
  });

  it('falls back to the id for a guest who has gone from the directory', () => {
    const context = contextWith(['G-77', 'G-78']);
    context.reference.guests.delete('G-77');
    const built = buildLeaderboard(day('2025-01-13'), day('2025-01-15'), context, 10);
    expect(built.bestDays.some((row) => row.name === 'G-77')).toBe(false);
    expect(built.bestSeasons.some((row) => row.guestId === 'G-78')).toBe(true);
  });
});

describe('rendering the leaderboard', () => {
  it('prints two tables with their own columns', () => {
    const lines = renderLeaderboard(report());
    const days = lines.indexOf('biggest days');
    const seasons = lines.indexOf('biggest seasons');
    expect(lines[days + 1]?.trim().split(/\s+/)).toEqual([
      'rank',
      'guest',
      'date',
      'vertical',
      'rides',
    ]);
    expect(lines[seasons + 1]?.trim().split(/\s+/)).toEqual([
      'rank',
      'guest',
      'days',
      'vertical',
      'rides',
    ]);
  });

  it('opens with the period and closes with the opt out count', () => {
    const lines = renderLeaderboard(report(['G-77']));
    expect(lines[0]).toBe('vertical leaderboard  2025-01-13 to 2025-01-15');
    expect(lines[lines.length - 1]).toBe('1 guests left off, having opted out');
  });
});
