import { describe, expect, it } from 'vitest';
import {
  readHealth,
  SUSPECT_GAP_MINUTES,
  SUSPECT_WEAK_SHARE,
  terminalHealth,
} from '../../../../src/domain/lift/health.js';
import { normaliseScans } from '../../../../src/domain/scan/normalise.js';
import { CARD_ROW } from '../../../support/media.js';
import { clocks, rawScan, terminals } from '../../../support/scans.js';
import { terminalOf } from '../../../support/terminals.js';
import { day } from '../../../support/season.js';

const date = day('2025-01-13');
const norm = () => ({ clocks: clocks(), terminals: terminals() });

function scansAt(specs: readonly { terminal: string; minutes: number; rssi?: number }[]) {
  const base = new Date('2025-01-13T16:00:00Z').getTime();
  return normaliseScans(
    specs.map((spec, i) =>
      rawScan({
        terminal: spec.terminal,
        media: CARD_ROW,
        at: new Date(base + spec.minutes * 60_000).toISOString(),
        seq: i + 1,
        rssi: spec.rssi ?? -52,
      }),
    ),
    norm(),
  );
}

describe('one gate', () => {
  const gate = terminalOf({ id: 'SUNB.01' });

  it('counts what it read and when', () => {
    const reading = readHealth(gate, scansAt([{ terminal: 'SUNB.01', minutes: 0 }]), date);
    expect(reading.scans).toBe(1);
    expect(reading.firstAt).toEqual(reading.lastAt);
    expect(reading.silent).toBe(false);
  });

  it('measures the longest gap between reads', () => {
    const reading = readHealth(
      gate,
      scansAt([
        { terminal: 'SUNB.01', minutes: 0 },
        { terminal: 'SUNB.01', minutes: 10 },
        { terminal: 'SUNB.01', minutes: 130 },
      ]),
      date,
    );
    expect(reading.longestGapMinutes).toBe(120);
    expect(reading.suspect).toBe(true);
  });

  it('leaves a gate with ordinary gaps alone', () => {
    const reading = readHealth(
      gate,
      scansAt([
        { terminal: 'SUNB.01', minutes: 0 },
        { terminal: 'SUNB.01', minutes: 30 },
      ]),
      date,
    );
    expect(reading.suspect).toBe(false);
    expect(SUSPECT_GAP_MINUTES).toBe(90);
  });

  it('counts the weak reads and gives a share', () => {
    const reading = readHealth(
      gate,
      scansAt([
        { terminal: 'SUNB.01', minutes: 0, rssi: -80 },
        { terminal: 'SUNB.01', minutes: 5, rssi: -80 },
        { terminal: 'SUNB.01', minutes: 10 },
        { terminal: 'SUNB.01', minutes: 15 },
      ]),
      date,
    );
    expect(reading.weakReads).toBe(2);
    expect(reading.weakShare).toBe(50);
    expect(reading.suspect).toBe(true);
    expect(SUSPECT_WEAK_SHARE).toBe(25);
  });

  it('gives a silent gate zeroes rather than nothing', () => {
    const reading = readHealth(gate, [], date);
    expect(reading).toMatchObject({ scans: 0, weakShare: 0, longestGapMinutes: 0, silent: true });
    expect(reading.firstAt).toBeUndefined();
  });
});

describe('the whole maze', () => {
  it('gives a reading for every live gate', () => {
    const report = terminalHealth(
      terminals(),
      scansAt([{ terminal: 'SUNB.01', minutes: 0 }]),
      date,
    );
    expect(report.readings).toHaveLength(9);
    expect(report.date).toBe(date);
  });

  it('names a gate that read nothing while its maze was busy', () => {
    const report = terminalHealth(
      terminals(),
      scansAt([
        { terminal: 'SUNB.01', minutes: 0 },
        { terminal: 'SUNB.01', minutes: 20 },
      ]),
      date,
    );
    expect(report.silentInBusyMaze).toEqual(['SUNB.02', 'SUNB.03']);
  });

  it('says nothing about a maze where nobody skied at all', () => {
    expect(terminalHealth(terminals(), [], date).silentInBusyMaze).toEqual([]);
  });

  it('lists the suspect gates', () => {
    const report = terminalHealth(
      terminals(),
      scansAt([
        { terminal: 'SUNB.01', minutes: 0 },
        { terminal: 'SUNB.01', minutes: 200 },
      ]),
      date,
    );
    expect(report.suspect).toEqual(['SUNB.01']);
  });

  it('sorts the readings by the worst gap', () => {
    const report = terminalHealth(
      terminals(),
      scansAt([
        { terminal: 'SUNB.01', minutes: 0 },
        { terminal: 'SUNB.01', minutes: 200 },
        { terminal: 'MEADW.01', minutes: 0 },
      ]),
      date,
    );
    expect(report.readings[0]?.terminal).toBe('SUNB.01');
  });
});
