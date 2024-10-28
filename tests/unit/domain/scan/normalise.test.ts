import { describe, expect, it } from 'vitest';
import {
  compareScans,
  duplicateSequences,
  LARGE_CORRECTION_MS,
  normaliseScan,
  normaliseScans,
  scansOnDate,
  sequenceGaps,
} from '../../../../src/domain/scan/normalise.js';
import { DiagnosticBag } from '../../../../src/util/diagnostic.js';
import { clocks, rawScan, terminals } from '../../../support/scans.js';
import { day } from '../../../support/season.js';

const options = () => ({ clocks: clocks(), terminals: terminals() });

describe('normalising one scan', () => {
  it('moves the reading onto the area timeline and dates the day', () => {
    const scan = normaliseScan(rawScan(), options());
    expect(scan?.at.toISOString()).toBe('2025-01-13T16:14:15.000Z');
    expect(scan?.correctionMs).toBe(8_000);
    expect(scan?.operatingDate).toBe('2025-01-13');
    expect(scan?.lift).toBe('SUNB');
    expect(scan?.maze).toBe('SUNB');
  });

  it('leaves a gate with no handshake exactly where it said it was', () => {
    const scan = normaliseScan(rawScan({ terminal: 'MEADW.01' }), options());
    expect(scan?.at.toISOString()).toBe('2025-01-13T16:14:07.000Z');
    expect(scan?.correctionMs).toBe(0);
  });

  it('drops a scan from a terminal nobody has on file and says so', () => {
    const bag = new DiagnosticBag();
    const scan = normaliseScan(rawScan({ terminal: 'GHOST.01' }), {
      ...options(),
      diagnostics: bag,
    });
    expect(scan).toBeUndefined();
    expect(bag.has('scan.unknown_terminal')).toBe(true);
  });

  it('notes a correction big enough to matter', () => {
    const bag = new DiagnosticBag();
    normaliseScan(rawScan({ terminal: 'BOWL.01' }), {
      ...options(),
      diagnostics: bag,
      batch: 'up-441',
    });
    expect(bag.has('scan.large_correction')).toBe(true);
    expect(bag.all()[0]?.source).toEqual({ batch: 'up-441' });
    expect(LARGE_CORRECTION_MS).toBe(90_000);
  });

  it('notes a read at the edge of the field', () => {
    const bag = new DiagnosticBag();
    const scan = normaliseScan(rawScan({ rssi: -80 }), { ...options(), diagnostics: bag });
    expect(scan?.weakRead).toBe(true);
    expect(bag.has('scan.weak_read')).toBe(true);
  });

  it('rolls a scan before the boundary onto the previous day', () => {
    const scan = normaliseScan(
      rawScan({ terminal: 'MEADW.01', at: '2025-01-14T04:30:00Z' }),
      options(),
    );
    expect(scan?.operatingDate).toBe('2025-01-13');
  });
});

describe('normalising a batch', () => {
  it('puts everything on one timeline in order', () => {
    const scans = normaliseScans(
      [
        rawScan({ terminal: 'RIDGE.01', at: '2025-01-13T16:14:10Z', seq: 2 }),
        rawScan({ terminal: 'SUNB.01', at: '2025-01-13T16:14:07Z', seq: 1 }),
      ],
      options(),
    );
    expect(scans.map((scan) => scan.terminalId)).toEqual(['RIDGE.01', 'SUNB.01']);
  });

  it('sorts a tie by terminal and then by sequence', () => {
    const scans = normaliseScans(
      [
        rawScan({ terminal: 'MEADW.01', at: '2025-01-13T16:14:07Z', seq: 9 }),
        rawScan({ terminal: 'MEADW.01', at: '2025-01-13T16:14:07Z', seq: 4 }),
        rawScan({ terminal: 'CRPT.01', at: '2025-01-13T16:14:07Z', seq: 7 }),
      ],
      options(),
    );
    expect(scans.map((scan) => `${scan.terminalId}#${scan.sequence}`)).toEqual([
      'CRPT.01#7',
      'MEADW.01#4',
      'MEADW.01#9',
    ]);
  });

  it('drops the unreadable terminals and keeps the rest', () => {
    const bag = new DiagnosticBag();
    const scans = normaliseScans(
      [rawScan(), rawScan({ terminal: 'GHOST.01', seq: 2 }), rawScan({ seq: 3 })],
      { ...options(), diagnostics: bag },
    );
    expect(scans).toHaveLength(2);
    expect(bag.bySeverity('error')).toHaveLength(1);
  });

  it('orders a pair the correction actually reverses', () => {
    const bowl = rawScan({ terminal: 'BOWL.01', at: '2025-01-13T16:15:00Z', seq: 1 });
    const meadow = rawScan({ terminal: 'MEADW.01', at: '2025-01-13T16:14:00Z', seq: 1 });
    const scans = normaliseScans([bowl, meadow], options());
    expect(scans.map((scan) => scan.terminalId)).toEqual(['MEADW.01', 'BOWL.01']);
    expect(compareScans(scans[0]!, scans[1]!)).toBeLessThan(0);
  });
});

describe('what the sequence numbers say', () => {
  const scansOf = (specs: readonly [string, number][]) =>
    normaliseScans(
      specs.map(([id, seq]) => rawScan({ terminal: id, seq, at: '2025-01-13T16:14:07Z' })),
      options(),
    );

  it('finds nothing when a terminal counted straight through', () => {
    expect(
      sequenceGaps(
        scansOf([
          ['MEADW.01', 1],
          ['MEADW.01', 2],
          ['MEADW.01', 3],
        ]),
      ),
    ).toEqual([]);
  });

  it('reports a hole with the count of what is missing', () => {
    expect(
      sequenceGaps(
        scansOf([
          ['MEADW.01', 1],
          ['MEADW.01', 5],
        ]),
      ),
    ).toEqual([{ terminalId: 'MEADW.01', after: 1, before: 5, missing: 3 }]);
  });

  it('keeps each terminal separate', () => {
    const gaps = sequenceGaps(
      scansOf([
        ['MEADW.01', 1],
        ['MEADW.01', 4],
        ['CRPT.01', 7],
        ['CRPT.01', 8],
      ]),
    );
    expect(gaps.map((gap) => gap.terminalId)).toEqual(['MEADW.01']);
  });

  it('finds a sequence number the gate sent twice', () => {
    const repeats = duplicateSequences(
      scansOf([
        ['MEADW.01', 1],
        ['MEADW.01', 1],
        ['MEADW.01', 2],
      ]),
    );
    expect(repeats).toHaveLength(1);
    expect(repeats[0]?.sequence).toBe(1);
  });

  it('does not call two terminals on one number a duplicate', () => {
    expect(
      duplicateSequences(
        scansOf([
          ['MEADW.01', 1],
          ['CRPT.01', 1],
        ]),
      ),
    ).toEqual([]);
  });
});

describe('slicing by day', () => {
  it('keeps only the scans on the day asked for', () => {
    const scans = normaliseScans(
      [
        rawScan({ terminal: 'MEADW.01', at: '2025-01-13T18:00:00Z', seq: 1 }),
        rawScan({ terminal: 'MEADW.01', at: '2025-01-14T18:00:00Z', seq: 2 }),
      ],
      options(),
    );
    expect(scansOnDate(scans, day('2025-01-13'))).toHaveLength(1);
    expect(scansOnDate(scans, day('2025-01-15'))).toEqual([]);
  });
});
