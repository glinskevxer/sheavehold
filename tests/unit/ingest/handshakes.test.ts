import { describe, expect, it } from 'vitest';
import {
  clockBookFrom,
  driftReport,
  handshakeRow,
  readHandshakeFile,
  writeHandshakeFile,
} from '../../../src/ingest/handshakes.js';
import { expect as expectOk, isErr } from '../../../src/util/result.js';
import { handshake, terminal } from '../../support/scans.js';

const FILE = [
  'terminal,server,gate',
  'SUNB.01,2025-01-13T11:00:00Z,2025-01-13T10:59:52Z',
  'SUNB.01,2025-01-14T11:00:00Z,2025-01-14T10:59:44Z',
  'RIDGE.01,2025-01-13T11:00:00Z,2025-01-13T11:00:00Z',
].join('\n');

const read = () => expectOk(readHandshakeFile(FILE), 'handshakes');

describe('reading the handshake file', () => {
  it('reads every line into a handshake', () => {
    expect(read().handshakes).toHaveLength(3);
    expect(read().handshakes[0]?.terminalId).toBe('SUNB.01');
    expect(read().diagnostics.length).toBe(0);
  });

  it('refuses a file with a column missing', () => {
    expect(isErr(readHandshakeFile('terminal,server\nSUNB.01,2025-01-13T11:00:00Z'))).toBe(true);
  });

  it('refuses a file that is not a table', () => {
    expect(isErr(readHandshakeFile(''))).toBe(true);
  });

  it('drops a row whose gate id is not one', () => {
    const bad = expectOk(
      readHandshakeFile('terminal,server,gate\nSUNB,2025-01-13T11:00:00Z,2025-01-13T11:00:00Z'),
      'handshakes',
    );
    expect(bad.handshakes).toEqual([]);
    expect(bad.diagnostics.has('handshake.bad_terminal')).toBe(true);
    expect(bad.diagnostics.has('handshake.nothing_usable')).toBe(true);
  });

  it('drops a row with an unreadable time and points at the line', () => {
    const bad = expectOk(
      readHandshakeFile('terminal,server,gate\nSUNB.01,never,2025-01-13T11:00:00Z', 'links.csv'),
      'handshakes',
    );
    expect(bad.diagnostics.bySeverity('error')[0]?.source).toEqual({
      file: 'links.csv',
      line: 2,
    });
  });

  it('exposes the row schema for the api to reuse', () => {
    expect(handshakeRow.safeParse({ terminal: 'SUNB.01', server: 'a', gate: 'b' }).success).toBe(
      true,
    );
    expect(handshakeRow.safeParse({ terminal: '' }).success).toBe(false);
  });

  it('round trips through the writer', () => {
    expect(writeHandshakeFile(read().handshakes)).toBe(
      [
        'terminal,server,gate',
        'SUNB.01,2025-01-13T11:00:00.000Z,2025-01-13T10:59:52.000Z',
        'SUNB.01,2025-01-14T11:00:00.000Z,2025-01-14T10:59:44.000Z',
        'RIDGE.01,2025-01-13T11:00:00.000Z,2025-01-13T11:00:00.000Z',
      ].join('\n'),
    );
  });
});

describe('building the clock model from a file', () => {
  it('gives one clock per gate', () => {
    const clocks = clockBookFrom(read().handshakes);
    expect(clocks.size).toBe(2);
    expect(clocks.for(terminal('SUNB.01')).count).toBe(2);
  });

  it('corrects a scan by the interpolated offset', () => {
    const clocks = clockBookFrom(read().handshakes);
    expect(
      clocks.for(terminal('SUNB.01')).correct(new Date('2025-01-14T11:00:00Z')).toISOString(),
    ).toBe('2025-01-14T11:00:16.000Z');
  });
});

describe('the drift report', () => {
  it('gives a row per gate, worst first', () => {
    const rows = driftReport(clockBookFrom(read().handshakes));
    expect(rows.map((row) => row.terminal)).toEqual(['SUNB.01', 'RIDGE.01']);
    expect(rows[0]?.handshakes).toBe(2);
    expect(rows[0]?.worstDriftPpm).toBeGreaterThan(0);
  });

  it('marks a gate that has clearly been power cycled', () => {
    const clocks = clockBookFrom([
      handshake('BOWL.01', '2025-01-13T11:00:00Z', '2015-01-13T11:00:00Z'),
    ]);
    expect(driftReport(clocks)[0]?.needsAttention).toBe(true);
  });

  it('gives nothing for an empty book', () => {
    expect(driftReport(clockBookFrom([]))).toEqual([]);
  });
});
