import type { OperatingCalendar } from '../domain/calendar/season.js';
import type { ExceptionRegister } from '../domain/exception/register.js';
import type { LiftRegistry } from '../domain/lift/lift.js';
import type { TerminalRegistry } from '../domain/lift/terminal.js';
import type { BlackoutRegistry } from '../domain/product/blackout.js';
import type { ProductCatalogue } from '../domain/product/product.js';
import type { ClockBook } from '../domain/scan/clock-skew.js';
import type { TransferMap } from '../domain/exception/transfer.js';
import type { GuestDirectory } from '../domain/guest/guest.js';
import type { SequenceLedger } from '../ingest/envelope.js';
import type { ReferenceStore } from '../storage/repository/reference.js';
import type { RideStore } from '../storage/repository/rides.js';
import type { ScanStore } from '../storage/repository/scans.js';

/**
 * Everything a command needs, handed in rather than built inside. The real
 * entry point opens a store and fills this in; a test fills it in from
 * fixtures and never touches a disk.
 */
export interface CliApp {
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
  readonly readFile: (path: string) => string;
  readonly writeFile: (path: string, text: string) => void;
}
