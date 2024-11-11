import { describe, expect, it } from 'vitest';
import {
  admitScan,
  admitScans,
  admitted,
  disagreements,
  refusalsOnDate,
  refused,
  unresolvedMedia,
  type AdmissionContext,
} from '../../../../src/domain/scan/admission.js';
import { normaliseScan, normaliseScans } from '../../../../src/domain/scan/normalise.js';
import { bindings, CARD_LOOSE, CARD_ROW, CARD_TESS, mediaMap } from '../../../support/media.js';
import { clocks, rawScan, terminals } from '../../../support/scans.js';
import { day } from '../../../support/season.js';

const options = () => ({ clocks: clocks(), terminals: terminals() });
const context = (): AdmissionContext => ({
  terminals: terminals(),
  bindings: bindings(),
  media: mediaMap(),
});

const scanOf = (overrides: Parameters<typeof rawScan>[0] = {}) =>
  normaliseScan(rawScan(overrides), options())!;

describe('admitting one scan', () => {
  it('resolves a good card to its entitlement and holder', () => {
    const result = admitScan(scanOf(), context());
    expect(result.outcome).toBe('admitted');
    expect(result.entitlementId).toBe('ENT-1001');
    expect(result.guestId).toBe('G-77');
    expect(result.detail).toBe('ENT-1001 for G-77');
    expect(result.disagreesWithGate).toBe(false);
  });

  it('refuses a card nobody has on file', () => {
    const result = admitScan(scanOf({ media: 'E2004A1B0000FFFF' }), context());
    expect(result.refusal).toBe('unknown_media');
    expect(result.entitlementId).toBeUndefined();
  });

  it('refuses a card that was destroyed', () => {
    const result = admitScan(scanOf({ media: CARD_LOOSE }), context());
    expect(result.refusal).toBe('media_retired');
  });

  it('refuses a card that carried nothing at that moment', () => {
    const result = admitScan(scanOf({ at: '2024-11-01T16:14:07Z' }), context());
    expect(result.refusal).toBe('no_binding');
  });

  it('refuses a gate that is not in service', () => {
    const result = admitScan(scanOf({ terminal: 'POMA.01' }), context());
    expect(result.refusal).toBe('gate_out_of_service');
  });

  it('refuses a download gate, which never makes an uphill ride', () => {
    const result = admitScan(scanOf({ terminal: 'RIDGE.09' }), context());
    expect(result.refusal).toBe('download_gate');
  });

  it('notes when we disagree with what the gate did', () => {
    const gateLetThemOn = admitScan(scanOf({ media: 'E2004A1B0000FFFF' }), context());
    expect(gateLetThemOn.disagreesWithGate).toBe(true);
    const gateTurnedThemAway = admitScan(
      scanOf({ outcome: 'reject', reason: 'stale cache' }),
      context(),
    );
    expect(gateTurnedThemAway.outcome).toBe('admitted');
    expect(gateTurnedThemAway.disagreesWithGate).toBe(true);
  });

  it('checks the gate before the card', () => {
    const result = admitScan(scanOf({ terminal: 'POMA.01', media: 'E2004A1B0000FFFF' }), context());
    expect(result.refusal).toBe('gate_out_of_service');
  });
});

describe('admitting a batch', () => {
  const batch = () =>
    normaliseScans(
      [
        rawScan({ seq: 1, at: '2025-01-13T16:14:07Z' }),
        rawScan({ seq: 2, at: '2025-01-13T16:20:00Z', media: CARD_TESS }),
        rawScan({ seq: 3, at: '2025-01-13T16:30:00Z', media: 'E2004A1B0000FFFF' }),
        rawScan({ seq: 4, at: '2025-01-14T16:30:00Z', media: CARD_LOOSE }),
      ],
      options(),
    );

  it('splits the admitted from the refused and keeps the order', () => {
    const results = admitScans(batch(), context());
    expect(results).toHaveLength(4);
    expect(admitted(results).map((r) => r.scan.sequence)).toEqual([1, 2]);
    expect(refused(results).map((r) => r.refusal)).toEqual(['unknown_media', 'media_retired']);
  });

  it('lists the serials worth chasing, without the destroyed ones', () => {
    const results = admitScans(batch(), context());
    expect(unresolvedMedia(results)).toEqual(['E2004A1B0000FFFF']);
  });

  it('lists every disagreement with the gate', () => {
    const results = admitScans(batch(), context());
    expect(disagreements(results)).toHaveLength(2);
  });

  it('slices the refusals to one operating day', () => {
    const results = admitScans(batch(), context());
    expect(refusalsOnDate(results, day('2025-01-13'))).toHaveLength(1);
    expect(refusalsOnDate(results, day('2025-01-14'))).toHaveLength(1);
    expect(refusalsOnDate(results, day('2025-02-01'))).toEqual([]);
  });

  it('keeps the same card resolving across the batch', () => {
    const results = admitted(admitScans(batch(), context()));
    expect(results.map((r) => r.guestId)).toEqual(['G-77', 'G-78']);
    expect(results[0]?.scan.mediaSerial).toBe(CARD_ROW);
  });
});
