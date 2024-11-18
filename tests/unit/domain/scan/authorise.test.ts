import { describe, expect, it } from 'vitest';
import {
  allowedOnly,
  authoriseScan,
  authoriseScans,
  DayUseLedger,
  deniedOnly,
  denialTally,
  type AuthorisationContext,
} from '../../../../src/domain/scan/authorise.js';
import { admitScan, admitScans } from '../../../../src/domain/scan/admission.js';
import { normaliseScan, normaliseScans } from '../../../../src/domain/scan/normalise.js';
import { bindings, CARD_IDA, CARD_MILO, CARD_TESS, mediaMap } from '../../../support/media.js';
import { blackouts, catalogue, entitlementMap } from '../../../support/entitlements.js';
import { clocks, rawScan, terminals } from '../../../support/scans.js';
import { calendar2024, day } from '../../../support/season.js';

const norm = () => ({ clocks: clocks(), terminals: terminals() });
const admit = () => ({ terminals: terminals(), bindings: bindings(), media: mediaMap() });

function context(ledger = new DayUseLedger()): AuthorisationContext {
  return {
    entitlements: entitlementMap(),
    products: catalogue(),
    calendar: calendar2024(),
    blackouts: blackouts(),
    ledger,
  };
}

const one = (overrides: Parameters<typeof rawScan>[0] = {}) =>
  admitScan(normaliseScan(rawScan(overrides), norm())!, admit());

describe('the day use ledger', () => {
  it('starts empty and remembers what it is told', () => {
    const ledger = new DayUseLedger();
    expect(ledger.daysUsed('ENT-1').size).toBe(0);
    ledger.useDay('ENT-1', day('2025-01-13'));
    ledger.useDay('ENT-1', day('2025-01-13'));
    expect(ledger.daysUsed('ENT-1').size).toBe(1);
    expect(ledger.entitlements()).toEqual(['ENT-1']);
  });

  it('counts entries per entitlement per day', () => {
    const ledger = new DayUseLedger();
    ledger.countEntry('ENT-1', day('2025-01-13'));
    ledger.countEntry('ENT-1', day('2025-01-13'));
    ledger.countEntry('ENT-1', day('2025-01-14'));
    expect(ledger.entriesOn('ENT-1', day('2025-01-13'))).toBe(2);
    expect(ledger.entriesOn('ENT-1', day('2025-01-14'))).toBe(1);
    expect(ledger.entriesOn('ENT-2', day('2025-01-13'))).toBe(0);
  });

  it('rebuilds from rows and clears', () => {
    const ledger = DayUseLedger.from([
      { entitlementId: 'ENT-1', date: day('2025-01-13') },
      { entitlementId: 'ENT-1', date: day('2025-01-14') },
    ]);
    expect(ledger.daysUsed('ENT-1').size).toBe(2);
    ledger.clear();
    expect(ledger.entitlements()).toEqual([]);
  });
});

describe('authorising one scan', () => {
  it('lets a season pass on and never counts a day against it', () => {
    const result = authoriseScan(one(), context());
    expect(result.allowed).toBe(true);
    expect(result.consumedDay).toBe(false);
    expect(result.productCode).toBe('SEAS');
  });

  it('counts the first day of a three day ticket', () => {
    const ledger = new DayUseLedger();
    const result = authoriseScan(one({ media: CARD_TESS }), context(ledger));
    expect(result.consumedDay).toBe(true);
    expect(ledger.daysUsed('ENT-1002').has('2025-01-13')).toBe(true);
  });

  it('does not count the same day twice', () => {
    const ledger = new DayUseLedger();
    authoriseScan(one({ media: CARD_TESS }), context(ledger));
    const second = authoriseScan(one({ media: CARD_TESS, seq: 2 }), context(ledger));
    expect(second.consumedDay).toBe(false);
    expect(ledger.daysUsed('ENT-1002').size).toBe(1);
  });

  it('stops a beginner ticket on a big lift', () => {
    const result = authoriseScan(one({ media: CARD_MILO }), context());
    expect(result.denial).toBe('lift_not_in_scope');
    expect(result.entitlementId).toBe('ENT-1003');
  });

  it('lets the beginner ticket on the carpet', () => {
    const result = authoriseScan(one({ media: CARD_MILO, terminal: 'CRPT.01' }), context());
    expect(result.allowed).toBe(true);
  });

  it('stops a midweek pass on a weekend', () => {
    const result = authoriseScan(one({ media: CARD_IDA, at: '2025-01-11T18:00:00Z' }), context());
    expect(result.denial).toBe('blackout');
  });

  it('passes a refusal straight through', () => {
    const result = authoriseScan(one({ media: 'E2004A1B0000FFFF' }), context());
    expect(result.denial).toBe('no_entitlement');
    expect(result.allowed).toBe(false);
  });

  it('complains when the entitlement is not on file', () => {
    const empty = { ...context(), entitlements: new Map() };
    expect(authoriseScan(one(), empty).denial).toBe('no_entitlement');
  });

  it('complains when the product has gone from the catalogue', () => {
    const bare = { ...context(), products: { find: () => undefined } };
    const result = authoriseScan(one(), bare);
    expect(result.denial).toBe('no_product');
    expect(result.entitlementId).toBe('ENT-1001');
  });

  it('applies a dated blackout after the product rules pass', () => {
    const result = authoriseScan(one({ media: CARD_TESS, at: '2024-12-28T18:00:00Z' }), context());
    expect(result.denial).toBe('dated_blackout');
    expect(result.detail).toContain('christmas peak');
  });

  it('leaves the day counter alone when the blackout bites', () => {
    const ledger = new DayUseLedger();
    authoriseScan(one({ media: CARD_TESS, at: '2024-12-28T18:00:00Z' }), context(ledger));
    expect(ledger.daysUsed('ENT-1002').size).toBe(0);
  });
});

describe('authorising a batch', () => {
  function batch(specs: readonly { media: string; at: string; terminal?: string }[]) {
    return admitScans(
      normaliseScans(
        specs.map((spec, i) =>
          rawScan({
            media: spec.media,
            at: spec.at,
            seq: i + 1,
            terminal: spec.terminal ?? 'MEADW.01',
          }),
        ),
        norm(),
      ),
      admit(),
    );
  }

  it('spends the three day ticket over three distinct days', () => {
    const ledger = new DayUseLedger();
    const results = authoriseScans(
      batch([
        { media: CARD_TESS, at: '2025-01-13T18:00:00Z' },
        { media: CARD_TESS, at: '2025-01-14T18:00:00Z' },
        { media: CARD_TESS, at: '2025-01-15T18:00:00Z' },
        { media: CARD_TESS, at: '2025-01-16T18:00:00Z' },
      ]),
      context(ledger),
    );
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]?.denial).toBe('days_exhausted');
    expect(ledger.daysUsed('ENT-1002').size).toBe(3);
  });

  it('lets the spent ticket keep riding on a day it already paid for', () => {
    const ledger = new DayUseLedger();
    authoriseScans(
      batch([
        { media: CARD_TESS, at: '2025-01-13T18:00:00Z' },
        { media: CARD_TESS, at: '2025-01-14T18:00:00Z' },
        { media: CARD_TESS, at: '2025-01-15T18:00:00Z' },
      ]),
      context(ledger),
    );
    const again = authoriseScans(
      batch([{ media: CARD_TESS, at: '2025-01-15T20:00:00Z' }]),
      context(ledger),
    );
    expect(again[0]?.allowed).toBe(true);
    expect(again[0]?.consumedDay).toBe(false);
  });

  it('splits the allowed from the denied', () => {
    const results = authoriseScans(
      batch([
        { media: CARD_TESS, at: '2025-01-13T18:00:00Z' },
        { media: CARD_MILO, at: '2025-01-13T18:05:00Z', terminal: 'SUNB.01' },
      ]),
      context(),
    );
    expect(allowedOnly(results)).toHaveLength(1);
    expect(deniedOnly(results)).toHaveLength(1);
  });

  it('tallies the reasons a day was turned away for', () => {
    const results = authoriseScans(
      batch([
        { media: CARD_MILO, at: '2025-01-13T18:00:00Z', terminal: 'SUNB.01' },
        { media: CARD_MILO, at: '2025-01-13T18:10:00Z', terminal: 'SUNB.01' },
        { media: CARD_IDA, at: '2025-01-11T18:00:00Z' },
      ]),
      context(),
    );
    expect([...denialTally(results)]).toEqual([
      ['blackout', 1],
      ['lift_not_in_scope', 2],
    ]);
  });

  it('gives a different answer when the same scans arrive out of order', () => {
    const inOrder = new DayUseLedger();
    authoriseScans(
      batch([
        { media: CARD_TESS, at: '2024-12-27T18:00:00Z' },
        { media: CARD_TESS, at: '2025-01-13T18:00:00Z' },
      ]),
      context(inOrder),
    );
    expect(inOrder.daysUsed('ENT-1002').size).toBe(1);
    expect([...inOrder.daysUsed('ENT-1002')]).toEqual(['2025-01-13']);
  });
});
