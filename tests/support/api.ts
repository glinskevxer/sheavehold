import { ExceptionRegister } from '../../src/domain/exception/register.js';
import { SequenceLedger } from '../../src/ingest/envelope.js';
import { addExceptionRoutes } from '../../src/api/exception-routes.js';
import { addReportRoutes } from '../../src/api/report-routes.js';
import { addRideRoutes } from '../../src/api/ride-routes.js';
import { addScanRoutes } from '../../src/api/scan-routes.js';
import { Router } from '../../src/api/router.js';
import { recomputeDates } from '../../src/service/recompute.js';
import { scanDateForExceptions } from '../../src/service/exceptions.js';
import { directory } from './guests.js';
import { transferMap } from './transfers.js';
import { CARD_TESS } from './media.js';
import { harness, type Harness } from './service.js';
import { clocks, terminals } from './scans.js';
import { day } from './season.js';

export interface ApiHarness {
  readonly router: Router;
  readonly system: Harness;
}

/** A router over a system holding one day of traffic. */
export function apiHarness(): ApiHarness {
  const system = harness();
  system.ingest([
    { at: '2025-01-13T17:00:00Z', seq: 1, terminal: 'SUNB.01' },
    { at: '2025-01-13T18:00:00Z', seq: 2, terminal: 'SUNB.01' },
  ]);
  system.ingest(
    [
      { at: '2025-01-13T17:30:00Z', seq: 1, terminal: 'MEADW.01', media: CARD_TESS },
      { at: '2025-01-13T17:34:00Z', seq: 2, terminal: 'MEADW.01', media: CARD_TESS },
    ],
    { batch: 'up-2', terminal: 'MEADW.01' },
  );
  recomputeDates([day('2025-01-13')], system);

  const router = new Router();
  addScanRoutes(router, {
    scans: system.scans,
    ingest: {
      terminals: terminals(),
      clocks: clocks(),
      scans: system.scans,
      sequences: new SequenceLedger(),
      receivedAt: new Date('2025-01-13T23:59:00Z'),
    },
  });
  addRideRoutes(router, {
    rides: system.rides,
    guests: { reference: system.reference, rides: system.rides, asOf: day('2025-01-15') },
    recompute: system,
  });
  const register = new ExceptionRegister();
  const scan = {
    rides: system.rides,
    register,
    lifts: system.lifts,
    transfers: transferMap(),
    guests: directory(),
  };
  scanDateForExceptions(day('2025-01-13'), scan);
  addExceptionRoutes(router, { register, scan });

  const daily = {
    rides: system.rides,
    scans: system.scans,
    calendar: system.calendar,
    lifts: system.lifts,
    reference: system.reference,
    register,
    generatedAt: new Date('2025-01-14T15:00:00Z'),
  };
  addReportRoutes(router, {
    daily,
    season: daily,
    mix: daily,
    seasonOpensOn: '2024-11-22',
  });
  return { router, system };
}
