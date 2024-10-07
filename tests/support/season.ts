import { makeSeason, OperatingCalendar, type Season } from '../../src/domain/calendar/season.js';
import { parseOperatingDate, type OperatingDate } from '../../src/util/clock.js';
import { expect as expectOk } from '../../src/util/result.js';

export const day = (raw: string): OperatingDate => expectOk(parseOperatingDate(raw), 'date');

export const SEASON_2024: Season = expectOk(
  makeSeason({ name: '2024/25', opensOn: '2024-11-22', closesOn: '2025-04-13' }),
  'season',
);

/**
 * The overrides the mountain manager actually wrote on the wall calendar:
 * the Christmas peak, two holiday weekends, a wind closure and Friday nights.
 */
export function calendar2024(): OperatingCalendar {
  const calendar = new OperatingCalendar(SEASON_2024);
  for (let d = 24; d <= 31; d += 1) {
    calendar.override(day(`2024-12-${String(d).padStart(2, '0')}`), { dayClass: 'peak' });
  }
  for (let d = 1; d <= 4; d += 1) {
    calendar.override(day(`2025-01-0${d}`), { dayClass: 'peak' });
  }
  calendar.override(day('2025-01-18'), { dayClass: 'holiday' });
  calendar.override(day('2025-01-19'), { dayClass: 'holiday' });
  calendar.override(day('2025-01-20'), { dayClass: 'holiday', note: 'martin luther king day' });
  calendar.override(day('2025-02-15'), { dayClass: 'holiday' });
  calendar.override(day('2025-02-16'), { dayClass: 'holiday' });
  calendar.override(day('2025-02-17'), { dayClass: 'holiday', note: 'presidents day' });
  calendar.override(day('2025-01-11'), { status: 'weather_hold', note: 'wind, whole mountain' });
  calendar.override(day('2024-12-03'), { status: 'closed', note: 'no snow yet' });
  for (const date of ['2025-01-10', '2025-01-17', '2025-01-24', '2025-01-31']) {
    calendar.override(day(date), { nightSkiing: true });
  }
  return calendar;
}
