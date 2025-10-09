import { ExceptionRegister } from '../../src/domain/exception/register.js';
import { SequenceLedger } from '../../src/ingest/envelope.js';
import { recomputeDates } from '../../src/service/recompute.js';
import { scanDateForExceptions } from '../../src/service/exceptions.js';
import type { CliApp } from '../../src/cli/app.js';
import { CollectedOutput } from '../../src/cli/output.js';
import { runCli, type CommandBuilder } from '../../src/cli/main.js';
import { directory } from './guests.js';
import { CARD_TESS } from './media.js';
import { harness } from './service.js';
import { clocks, terminals } from './scans.js';
import { day } from './season.js';
import { transferMap } from './transfers.js';

export interface CliHarness {
  readonly app: CliApp;
  readonly output: CollectedOutput;
  readonly files: Map<string, string>;
  run(argv: readonly string[]): number;
}

export function cliHarness(builders: readonly CommandBuilder[]): CliHarness {
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

  const register = new ExceptionRegister();
  scanDateForExceptions(day('2025-01-13'), {
    rides: system.rides,
    register,
    lifts: system.lifts,
    transfers: transferMap(),
    guests: directory(),
  });

  const files = new Map<string, string>();
  const app: CliApp = {
    reference: system.reference,
    scans: system.scans,
    rides: system.rides,
    register,
    terminals: terminals(),
    lifts: system.lifts,
    products: system.products,
    calendar: system.calendar,
    blackouts: system.blackouts,
    clocks: clocks(),
    transfers: transferMap(),
    guests: directory(),
    sequences: new SequenceLedger(),
    now: () => new Date('2025-01-14T15:00:00Z'),
    readFile: (path) => {
      const text = files.get(path);
      if (text === undefined) throw new Error(`no such file ${path}`);
      return text;
    },
    writeFile: (path, text) => {
      files.set(path, text);
    },
  };

  const output = new CollectedOutput();
  return {
    app,
    output,
    files,
    run: (argv) => runCli(argv, { app, output, builders }),
  };
}
