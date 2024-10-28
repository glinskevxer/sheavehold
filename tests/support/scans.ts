import { makeRawScan, type RawScan, type RawScanRow } from '../../src/domain/scan/scan.js';
import { ClockBook, type ClockHandshake } from '../../src/domain/scan/clock-skew.js';
import { TerminalRegistry } from '../../src/domain/lift/terminal.js';
import { parseTerminalId, type TerminalId } from '../../src/util/ids.js';
import { expect as expectOk } from '../../src/util/result.js';
import { ALL_TERMINALS } from './terminals.js';

export const terminal = (raw: string): TerminalId => expectOk(parseTerminalId(raw), 'terminal');

const DEFAULTS: RawScanRow = {
  terminal: 'SUNB.01',
  media: 'E2004A1B00000123',
  at: '2025-01-13T16:14:07Z',
  seq: 1,
  outcome: 'accept',
  reason: '',
  rssi: -52,
  antenna: 1,
};

export function rawScan(overrides: Partial<RawScanRow> = {}): RawScan {
  return expectOk(makeRawScan({ ...DEFAULTS, ...overrides }), 'scan');
}

export function terminals(): TerminalRegistry {
  return TerminalRegistry.from(ALL_TERMINALS);
}

export function handshake(id: string, serverAt: string, terminalAt: string): ClockHandshake {
  return {
    terminalId: terminal(id),
    serverAt: new Date(serverAt),
    terminalAt: new Date(terminalAt),
  };
}

/** Sunburst gate one runs eight seconds slow, everything else is honest. */
export function clocks(): ClockBook {
  return ClockBook.from([
    handshake('SUNB.01', '2025-01-13T11:00:00Z', '2025-01-13T10:59:52Z'),
    handshake('SUNB.02', '2025-01-13T11:00:00Z', '2025-01-13T11:00:00Z'),
    handshake('RIDGE.01', '2025-01-13T11:00:00Z', '2025-01-13T11:00:00Z'),
    handshake('BOWL.01', '2025-01-13T11:00:00Z', '2025-01-13T10:57:00Z'),
  ]);
}
