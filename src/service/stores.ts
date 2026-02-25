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
import type { OperatingDate } from '../util/clock.js';
import type { ExceptionScanContext } from './exceptions.js';
import type { GuestQueryContext } from './guest-query.js';
import type { IngestContext } from './ingest.js';
import type { QueryContext } from './query.js';
import type { RecomputeContext } from './recompute.js';
import type { RevenueContext } from './revenue.js';

/**
 * The same five context objects were being assembled by hand in the command
 * line, in the router, and in every test harness. They had drifted: the router
 * passed the register into the report context and the command line did not, so
 * the exception count on the api was right and the printed sheet said zero for
 * a fortnight.
 *
 * So a caller holds one bag of stores and asks for the context it needs.
 */
export interface Stores {
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

export function queryContext(stores: Stores): QueryContext {
  return {
    rides: stores.rides,
    scans: stores.scans,
    calendar: stores.calendar,
    lifts: stores.lifts,
  };
}

export function revenueContext(stores: Stores): RevenueContext {
  return { reference: stores.reference, rides: stores.rides };
}

export function recomputeContext(stores: Stores): RecomputeContext {
  return {
    reference: stores.reference,
    scans: stores.scans,
    rides: stores.rides,
    terminals: stores.terminals,
    lifts: stores.lifts,
    products: stores.products,
    calendar: stores.calendar,
    blackouts: stores.blackouts,
  };
}

export function ingestContext(stores: Stores): IngestContext {
  return {
    terminals: stores.terminals,
    clocks: stores.clocks,
    scans: stores.scans,
    sequences: stores.sequences,
    receivedAt: stores.now(),
  };
}

export function exceptionScanContext(stores: Stores): ExceptionScanContext {
  return {
    rides: stores.rides,
    register: stores.register,
    lifts: stores.lifts,
    transfers: stores.transfers,
    guests: stores.guests,
  };
}

export function guestQueryContext(stores: Stores, asOf: OperatingDate): GuestQueryContext {
  return { reference: stores.reference, rides: stores.rides, asOf };
}

/** What the daily report needs, which is the query context plus three more. */
export function reportContext(
  stores: Stores,
): QueryContext & RevenueContext & { register: ExceptionRegister; generatedAt: Date } {
  return {
    ...queryContext(stores),
    ...revenueContext(stores),
    register: stores.register,
    generatedAt: stores.now(),
  };
}
