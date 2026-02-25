import type { OperatingDate } from '../util/clock.js';
import {
  exceptionScanContext,
  guestQueryContext,
  ingestContext,
  recomputeContext,
  reportContext,
  type Stores,
} from '../service/stores.js';
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

export interface RouterOptions {
  readonly app: Stores;
  readonly asOf: string;
  readonly seasonOpensOn?: string | undefined;
}

export function buildRouter(options: RouterOptions): Router {
  const { app } = options;
  const router = new Router();
  const daily = reportContext(app);

  addScanRoutes(router, { scans: app.scans, ingest: ingestContext(app) });
  addRideRoutes(router, {
    rides: app.rides,
    guests: guestQueryContext(app, options.asOf as OperatingDate),
    recompute: recomputeContext(app),
  });
  addExceptionRoutes(router, {
    register: app.register,
    scan: exceptionScanContext(app),
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
