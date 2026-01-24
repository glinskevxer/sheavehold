import type { OperatingCalendar } from '../domain/calendar/season.js';
import type { ExceptionRegister } from '../domain/exception/register.js';
import type { TransferMap } from '../domain/exception/transfer.js';
import type { GuestDirectory } from '../domain/guest/guest.js';
import type { LiftRegistry } from '../domain/lift/lift.js';
import type { TerminalRegistry } from '../domain/lift/terminal.js';
import type { BlackoutRegistry } from '../domain/product/blackout.js';
import type { ProductCatalogue } from '../domain/product/product.js';
import type { ClockBook } from '../domain/scan/clock-skew.js';
import type { SequenceLedger } from '../ingest/envelope.js';
import type { ReferenceStore } from '../storage/repository/reference.js';
import type { RideStore } from '../storage/repository/rides.js';
import type { ScanStore } from '../storage/repository/scans.js';
import { addExceptionRoutes } from './exception-routes.js';
import { addReferenceRoute } from './reference.js';
import { addReportRoutes } from './report-routes.js';
import { addRideRoutes } from './ride-routes.js';
import { addScanRoutes } from './scan-routes.js';
import { Router } from './router.js';

/**
 * The whole router, assembled once. The generator that writes the api
 * reference and the process that serves requests both call this, so the
 * checked in page can never describe a different set of routes from the one
 * the base station is actually serving.
 */

/**
 * What the router needs. It is not the command line app type: the api layer
 * sits under the command line and must not reach up into it, and saying so
 * here rather than importing the other type is what keeps that true.
 */
export interface RouterStores {
  readonly reference: ReferenceStore;
  readonly scans: ScanStore;
  readonly rides: RideStore;
  readonly register: ExceptionRegister;
  readonly terminals: TerminalRegistry;
  readonly lifts: LiftRegistry;
  readonly products: ProductCatalogue;
  readonly calendar: OperatingCalendar;
  readonly blackouts: BlackoutRegistry;
  readonly clocks: ClockBook;
  readonly transfers: TransferMap;
  readonly guests: GuestDirectory;
  readonly sequences: SequenceLedger;
  readonly now: () => Date;
}

export interface RouterOptions {
  readonly app: RouterStores;
  readonly asOf: string;
  readonly seasonOpensOn?: string | undefined;
}

export function buildRouter(options: RouterOptions): Router {
  const { app } = options;
  const router = new Router();

  const daily = {
    rides: app.rides,
    scans: app.scans,
    calendar: app.calendar,
    lifts: app.lifts,
    reference: app.reference,
    register: app.register,
    generatedAt: app.now(),
  };

  const recompute = {
    reference: app.reference,
    scans: app.scans,
    rides: app.rides,
    terminals: app.terminals,
    lifts: app.lifts,
    products: app.products,
    calendar: app.calendar,
    blackouts: app.blackouts,
  };

  addScanRoutes(router, {
    scans: app.scans,
    ingest: {
      terminals: app.terminals,
      clocks: app.clocks,
      scans: app.scans,
      sequences: app.sequences,
      receivedAt: app.now(),
    },
  });

  addRideRoutes(router, {
    rides: app.rides,
    guests: {
      reference: app.reference,
      rides: app.rides,
      asOf: options.asOf as never,
    },
    recompute,
  });

  addExceptionRoutes(router, {
    register: app.register,
    scan: {
      rides: app.rides,
      register: app.register,
      lifts: app.lifts,
      transfers: app.transfers,
      guests: app.guests,
    },
  });

  addReportRoutes(router, {
    daily,
    season: daily,
    mix: daily,
    seasonOpensOn: options.seasonOpensOn ?? app.calendar.season.opensOn,
  });

  addReferenceRoute(router);
  return router;
}
