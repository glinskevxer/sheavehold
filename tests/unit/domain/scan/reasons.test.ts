import { describe, expect, it } from 'vitest';
import {
  allRejections,
  exceptionWorthy,
  gateDisplay,
  rejectionInfo,
  rejectionOf,
  rejectionTally,
  rejectionsByFault,
  rejectionsInBucket,
  turnaways,
  type ScanRejection,
} from '../../../../src/domain/scan/reasons.js';
import { admitScans } from '../../../../src/domain/scan/admission.js';
import { authoriseScans, DayUseLedger } from '../../../../src/domain/scan/authorise.js';
import { normaliseScans } from '../../../../src/domain/scan/normalise.js';
import {
  bindings,
  CARD_IDA,
  CARD_LOOSE,
  CARD_MILO,
  CARD_ROW,
  mediaMap,
} from '../../../support/media.js';
import { blackouts, catalogue, entitlementMap } from '../../../support/entitlements.js';
import { clocks, rawScan, terminals } from '../../../support/scans.js';
import { calendar2024 } from '../../../support/season.js';

describe('the table', () => {
  it('covers every code exactly once', () => {
    const codes = allRejections().map((info) => info.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toHaveLength(15);
  });

  it('keeps every gate display inside sixteen columns', () => {
    for (const info of allRejections()) {
      expect(info.display.length).toBeLessThanOrEqual(16);
      expect(info.display).toBe(info.display.toUpperCase());
    }
  });

  it('finds an entry and refuses one it does not have', () => {
    expect(rejectionInfo('expired').label).toBe('expired');
    expect(gateDisplay('lift_not_in_scope')).toBe('WRONG LIFT');
    expect(() => rejectionInfo('made_up' as ScanRejection)).toThrow('no rejection info');
  });

  it('never blames the guest for a gate that was shut', () => {
    expect(rejectionInfo('gate_out_of_service').fault).toBe('area');
    expect(rejectionInfo('gate_out_of_service').countsAsTurnaway).toBe(false);
    expect(rejectionInfo('download_gate').countsAsTurnaway).toBe(false);
  });

  it('never counts a record problem as a turnaway but always raises it', () => {
    for (const info of rejectionsInBucket('record')) {
      expect(info.raisesException).toBe(true);
      if (info.fault === 'data') expect(info.countsAsTurnaway).toBe(false);
    }
  });

  it('groups by bucket and by fault', () => {
    expect(rejectionsInBucket('equipment').map((info) => info.code)).toEqual([
      'gate_out_of_service',
      'download_gate',
    ]);
    expect(rejectionsByFault('area')).toHaveLength(2);
    expect(rejectionsByFault('guest').every((info) => info.countsAsTurnaway)).toBe(true);
  });
});

describe('reading a finished authorisation', () => {
  const norm = () => ({ clocks: clocks(), terminals: terminals() });
  const admit = () => ({ terminals: terminals(), bindings: bindings(), media: mediaMap() });
  const auth = () => ({
    entitlements: entitlementMap(),
    products: catalogue(),
    calendar: calendar2024(),
    blackouts: blackouts(),
    ledger: new DayUseLedger(),
  });

  function run(specs: readonly { media: string; at: string; terminal?: string }[]) {
    return authoriseScans(
      admitScans(
        normaliseScans(
          specs.map((spec, i) =>
            rawScan({
              media: spec.media,
              at: spec.at,
              seq: i + 1,
              terminal: spec.terminal ?? 'SUNB.01',
            }),
          ),
          norm(),
        ),
        admit(),
      ),
      auth(),
    );
  }

  it('gives nothing for a scan that got on', () => {
    const results = run([{ media: CARD_ROW, at: '2025-01-13T18:00:00Z' }]);
    expect(rejectionOf(results[0]!)).toBeUndefined();
  });

  it('reaches past the placeholder denial to the real refusal', () => {
    const results = run([{ media: 'E2004A1B0000FFFF', at: '2025-01-13T18:00:00Z' }]);
    expect(rejectionOf(results[0]!)).toBe('unknown_media');
  });

  it('keeps a refusal from the second stage', () => {
    const results = run([{ media: CARD_MILO, at: '2025-01-13T18:00:00Z' }]);
    expect(rejectionOf(results[0]!)).toBe('lift_not_in_scope');
  });

  it('separates the turnaways from everything else', () => {
    const results = run([
      { media: CARD_ROW, at: '2025-01-13T18:00:00Z' },
      { media: CARD_MILO, at: '2025-01-13T18:05:00Z' },
      { media: 'E2004A1B0000FFFF', at: '2025-01-13T18:10:00Z' },
      { media: CARD_LOOSE, at: '2025-01-13T18:15:00Z' },
    ]);
    expect(turnaways(results)).toHaveLength(2);
    expect(exceptionWorthy(results).map((r) => rejectionOf(r))).toEqual([
      'unknown_media',
      'media_retired',
    ]);
  });

  it('tallies what a day was refused for', () => {
    const results = run([
      { media: CARD_MILO, at: '2025-01-13T18:00:00Z' },
      { media: CARD_MILO, at: '2025-01-13T18:05:00Z' },
      { media: CARD_IDA, at: '2025-01-11T18:00:00Z' },
    ]);
    expect([...rejectionTally(results)]).toEqual([
      ['blackout', 1],
      ['lift_not_in_scope', 2],
    ]);
  });

  it('leaves a gate closure out of the turnaway count', () => {
    const results = run([{ media: CARD_ROW, at: '2025-01-13T18:00:00Z', terminal: 'POMA.01' }]);
    expect(rejectionOf(results[0]!)).toBe('gate_out_of_service');
    expect(turnaways(results)).toEqual([]);
  });
});
