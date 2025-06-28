import { ExceptionRegister } from '../../src/domain/exception/register.js';
import { recomputeDates } from '../../src/service/recompute.js';
import { scanDateForExceptions } from '../../src/service/exceptions.js';
import type { DailyReportContext } from '../../src/report/daily.js';
import { directory } from './guests.js';
import { CARD_TESS } from './media.js';
import { harness } from './service.js';
import { day } from './season.js';
import { transferMap } from './transfers.js';

export const GENERATED_AT = new Date('2025-01-14T15:00:00Z');

/** A day with two guests, three lifts, and one pass-back to find. */
export function reportContext(): DailyReportContext {
  const system = harness();
  system.ingest([
    { at: '2025-01-13T17:00:00Z', seq: 1, terminal: 'SUNB.01' },
    { at: '2025-01-13T17:20:00Z', seq: 2, terminal: 'SUNB.01' },
    { at: '2025-01-13T19:40:00Z', seq: 3, terminal: 'SUNB.01' },
  ]);
  system.ingest(
    [
      { at: '2025-01-13T17:30:00Z', seq: 1, terminal: 'MEADW.01', media: CARD_TESS },
      { at: '2025-01-13T17:34:00Z', seq: 2, terminal: 'MEADW.01', media: CARD_TESS },
    ],
    { batch: 'up-2', terminal: 'MEADW.01' },
  );
  recomputeDates([day('2025-01-13')], system);

  const register = new ExceptionRegister();
  scanDateForExceptions(day('2025-01-13'), {
    rides: system.rides,
    register,
    lifts: system.lifts,
    transfers: transferMap(),
    guests: directory(),
  });

  return {
    rides: system.rides,
    scans: system.scans,
    calendar: system.calendar,
    lifts: system.lifts,
    reference: system.reference,
    register,
    generatedAt: GENERATED_AT,
  };
}
