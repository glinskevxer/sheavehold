import { makeTerminal, type Terminal, type TerminalInput } from '../../src/domain/lift/terminal.js';
import { expect as expectOk } from '../../src/util/result.js';

const DEFAULTS: TerminalInput = {
  id: 'SUNB.01',
  direction: 'uphill',
  model: 'Axcess R4',
  firmware: '4.11.2',
  dwellSeconds: 6,
  status: 'live',
  installedSeason: 2016,
};

export function terminalOf(overrides: Partial<TerminalInput> = {}): Terminal {
  return expectOk(makeTerminal({ ...DEFAULTS, ...overrides }), 'terminal');
}

/** Three gates on Sunburst, two on Ridgeline, one each on the small lifts. */
export const ALL_TERMINALS: readonly Terminal[] = [
  terminalOf({ id: 'SUNB.01' }),
  terminalOf({ id: 'SUNB.02' }),
  terminalOf({ id: 'SUNB.03', firmware: '4.09.0', dwellSeconds: 9 }),
  terminalOf({ id: 'RIDGE.01', model: 'Axcess R6', dwellSeconds: 4 }),
  terminalOf({ id: 'RIDGE.02', model: 'Axcess R6', dwellSeconds: 4 }),
  terminalOf({ id: 'RIDGE.09', model: 'Axcess R6', direction: 'download', dwellSeconds: 4 }),
  terminalOf({ id: 'BOWL.01', firmware: '3.22.7', dwellSeconds: 11 }),
  terminalOf({ id: 'MEADW.01' }),
  terminalOf({ id: 'CRPT.01', model: 'Axcess C2', dwellSeconds: 2 }),
  terminalOf({ id: 'POMA.01', status: 'spare' }),
];
