import { describe, expect, it } from 'vitest';
import {
  LAPSED_AFTER_DAYS,
  offerList,
  renewalRows,
  summariseRenewals,
  type RenewalContext,
} from '../../../src/service/renewal.js';
import { recomputeDates } from '../../../src/service/recompute.js';
import { harness } from '../../support/service.js';
import { day } from '../../support/season.js';

function loaded(days: number, asOf = '2025-01-20'): RenewalContext {
  const system = harness();
  const base = new Date('2025-01-13T17:00:00Z').getTime();
  for (let i = 0; i < days; i += 1) {
    system.ingest([{ at: new Date(base + i * 86_400_000).toISOString(), seq: i + 1 }], {
      batch: `up-${i}`,
      terminal: 'SUNB.01',
      first: i + 1,
      last: i + 1,
    });
  }
  const dates = Array.from({ length: Math.max(days, 1) }, (_, i) =>
    day(new Date(base + i * 86_400_000).toISOString().slice(0, 10)),
  );
  recomputeDates(dates, system);
  return { reference: system.reference, rides: system.rides, asOf: day(asOf) };
}

const rowFor = (context: RenewalContext, id = 'ENT-1001') =>
  renewalRows(context).find((row) => row.entitlementId === id);

describe('the signal', () => {
  it('calls a pass nobody used lapsed', () => {
    expect(rowFor(loaded(0))?.signal).toBe('lapsed');
    expect(rowFor(loaded(0))?.note).toContain('never used it');
  });

  it('calls somebody who has not been out for weeks lapsed', () => {
    const row = rowFor(loaded(1, '2025-03-20'));
    expect(row?.signal).toBe('lapsed');
    expect(row?.daysSinceLastSeen).toBeGreaterThan(LAPSED_AFTER_DAYS);
  });

  it('calls a pass a long way from breaking even at risk', () => {
    const row = rowFor(loaded(2));
    expect(row?.signal).toBe('at_risk');
    expect(row?.costPerDay).toBeGreaterThan((row?.walkUpPrice ?? 0) * 2);
  });

  it('calls one close to breaking even undecided', () => {
    expect(rowFor(loaded(4))?.signal).toBe('undecided');
  });

  it('calls one that has paid for itself safe', () => {
    const row = rowFor(loaded(7));
    expect(row?.signal).toBe('safe');
    expect(row?.note).toContain('paid for itself');
  });
});

describe('the rows', () => {
  it('covers the unlimited passes and nothing else', () => {
    expect(
      renewalRows(loaded(3))
        .map((row) => row.entitlementId)
        .sort(),
    ).toEqual(['ENT-1001', 'ENT-2001']);
  });

  it('carries what they paid and what a day ticket costs', () => {
    const row = rowFor(loaded(3));
    expect(row?.pricePaid).toBe(89_900);
    expect(row?.walkUpPrice).toBe(12_900);
  });

  it('sorts the worst value first', () => {
    const rows = renewalRows(loaded(3));
    expect(rows[0]!.costPerDay).toBeGreaterThanOrEqual(rows[1]!.costPerDay);
  });

  it('takes a different walk up product', () => {
    expect(rowFor({ ...loaded(3), walkUpCode: 'BEG' })?.walkUpPrice).toBe(5_900);
  });

  it('gives nothing when the walk up product has gone', () => {
    expect(rowFor({ ...loaded(3), walkUpCode: 'GONE' })?.walkUpPrice).toBe(0);
  });
});

describe('the summary', () => {
  it('counts each signal and totals what is on the fence', () => {
    const summary = summariseRenewals(renewalRows(loaded(2)));
    expect(summary.atRisk + summary.undecided + summary.safe + summary.lapsed).toBe(2);
    expect(summary.valueAtRisk).toBeGreaterThan(0);
    expect(summary.valueAtRiskFormatted.startsWith('$')).toBe(true);
  });

  it('gives zeroes for nobody', () => {
    expect(summariseRenewals([])).toMatchObject({ safe: 0, atRisk: 0, valueAtRisk: 0 });
  });

  it('sends the offer only to the ones deciding', () => {
    const rows = renewalRows(loaded(2));
    expect(offerList(rows).every((row) => row.signal !== 'safe' && row.signal !== 'lapsed')).toBe(
      true,
    );
  });
});
