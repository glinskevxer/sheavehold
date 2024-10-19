import { describe, expect, it } from 'vitest';
import {
  checkEntitlement,
  daysRemaining,
  effectiveFrom,
  effectiveTo,
  makeEntitlement,
  type Entitlement,
  type EntitlementQuery,
} from '../../../../src/domain/product/entitlement.js';
import type { Product } from '../../../../src/domain/product/product.js';
import { parseLiftCode, type LiftCode } from '../../../../src/util/ids.js';
import { expect as expectOk, isErr } from '../../../../src/util/result.js';
import {
  ADULT_DAY,
  ADULT_THREE,
  BEGINNER_DAY,
  LESSON_CHILD,
  SEASON_MIDWEEK,
  SEASON_UNRESTRICTED,
} from '../../../support/products.js';
import { day } from '../../../support/season.js';

const lift = (raw: string): LiftCode => expectOk(parseLiftCode(raw), 'lift');

function entitlementOf(
  overrides: Partial<Parameters<typeof makeEntitlement>[0]> = {},
): Entitlement {
  return expectOk(
    makeEntitlement({
      id: 'ENT-1001',
      productCode: 'ADAY',
      guestId: 'G-77',
      purchasedAt: new Date('2024-12-20T15:00:00Z'),
      pricePaidCents: 12_900,
      ...overrides,
    }),
    'entitlement',
  );
}

function queryOf(product: Product, overrides: Partial<EntitlementQuery> = {}): EntitlementQuery {
  return {
    entitlement: entitlementOf({ productCode: product.code }),
    product,
    lift: lift('SUNB'),
    date: day('2025-01-13'),
    dayClass: 'midweek',
    at: new Date('2025-01-13T17:00:00Z'),
    daysUsed: new Set<string>(),
    entriesToday: 0,
    ...overrides,
  };
}

describe('building an entitlement', () => {
  it('folds the product code and trims the rest', () => {
    const entitlement = entitlementOf({ productCode: ' aday ', note: '  comped by ops ' });
    expect(entitlement.productCode).toBe('ADAY');
    expect(entitlement.note).toBe('comped by ops');
  });

  it('refuses missing pieces and a nonsense price', () => {
    expect(isErr(makeEntitlement({ ...entitlementOf(), id: ' ', pricePaidCents: 1 }))).toBe(true);
    expect(
      isErr(makeEntitlement({ ...entitlementOf(), productCode: ' ', pricePaidCents: 1 })),
    ).toBe(true);
    expect(isErr(makeEntitlement({ ...entitlementOf(), guestId: ' ', pricePaidCents: 1 }))).toBe(
      true,
    );
    expect(isErr(makeEntitlement({ ...entitlementOf(), pricePaidCents: -5 }))).toBe(true);
    expect(
      isErr(
        makeEntitlement({ ...entitlementOf(), purchasedAt: new Date('nope'), pricePaidCents: 1 }),
      ),
    ).toBe(true);
  });

  it('refuses a dated window in the wrong order', () => {
    expect(
      isErr(
        makeEntitlement({
          ...entitlementOf(),
          pricePaidCents: 1,
          validFrom: day('2025-01-20'),
          validTo: day('2025-01-13'),
        }),
      ),
    ).toBe(true);
  });
});

describe('the effective window', () => {
  it('takes the narrower of the two ends', () => {
    const dated = entitlementOf({ validFrom: day('2025-01-10'), validTo: day('2025-01-14') });
    expect(effectiveFrom(dated, ADULT_DAY)).toBe('2025-01-10');
    expect(effectiveTo(dated, ADULT_DAY)).toBe('2025-01-14');
  });

  it('never widens past the product', () => {
    const wide = entitlementOf({ validFrom: day('2024-10-01'), validTo: day('2025-06-01') });
    expect(effectiveFrom(wide, ADULT_DAY)).toBe('2024-11-22');
    expect(effectiveTo(wide, ADULT_DAY)).toBe('2025-04-13');
  });

  it('falls back to the product when the sale said nothing', () => {
    expect(effectiveFrom(entitlementOf(), ADULT_DAY)).toBe('2024-11-22');
    expect(effectiveTo(entitlementOf(), ADULT_DAY)).toBe('2025-04-13');
  });
});

describe('checking a scan against an entitlement', () => {
  it('lets a plain day ticket ride and counts the day', () => {
    const decision = checkEntitlement(queryOf(ADULT_DAY));
    expect(decision.allowed).toBe(true);
    expect(decision.consumesDay).toBe(true);
    expect(decision.detail).toBe('first ride of the day');
  });

  it('does not count the day twice on the second ride', () => {
    const decision = checkEntitlement(queryOf(ADULT_DAY, { daysUsed: new Set(['2025-01-13']) }));
    expect(decision.allowed).toBe(true);
    expect(decision.consumesDay).toBe(false);
    expect(decision.detail).toBe('another ride on a day already counted');
  });

  it('never counts a day against an unlimited pass', () => {
    expect(checkEntitlement(queryOf(SEASON_UNRESTRICTED)).consumesDay).toBe(false);
  });

  it('turns a voided pass away before anything else', () => {
    const entitlement = entitlementOf({ voidedAt: new Date('2025-01-13T16:00:00Z') });
    const decision = checkEntitlement(queryOf(ADULT_DAY, { entitlement }));
    expect(decision.reason).toBe('voided');
  });

  it('ignores a void that happens after the scan', () => {
    const entitlement = entitlementOf({ voidedAt: new Date('2025-01-13T18:00:00Z') });
    expect(checkEntitlement(queryOf(ADULT_DAY, { entitlement })).allowed).toBe(true);
  });

  it('turns away a scan before or after the window', () => {
    const early = queryOf(ADULT_DAY, { date: day('2024-11-01') });
    const late = queryOf(ADULT_DAY, { date: day('2025-04-20') });
    expect(checkEntitlement(early).reason).toBe('not_yet_valid');
    expect(checkEntitlement(late).reason).toBe('expired');
  });

  it('turns a midweek pass away on a weekend and leaves its days alone', () => {
    const decision = checkEntitlement(queryOf(SEASON_MIDWEEK, { dayClass: 'weekend' }));
    expect(decision.reason).toBe('blackout');
    expect(decision.consumesDay).toBe(false);
  });

  it('checks the blackout before the day counter', () => {
    const used = new Set(['2025-01-06', '2025-01-07', '2025-01-08']);
    const query = queryOf(ADULT_THREE, {
      dayClass: 'weekend',
      daysUsed: used,
      product: ADULT_THREE,
    });
    expect(checkEntitlement(query).reason).toBe('days_exhausted');
    const midweek = { ...ADULT_THREE, blackoutClasses: ['weekend'] as const };
    expect(checkEntitlement({ ...query, product: midweek }).reason).toBe('blackout');
  });

  it('keeps a beginner ticket off the big lifts', () => {
    expect(checkEntitlement(queryOf(BEGINNER_DAY)).reason).toBe('lift_not_in_scope');
    expect(checkEntitlement(queryOf(BEGINNER_DAY, { lift: lift('CRPT') })).allowed).toBe(true);
  });

  it('stops a three day ticket on the fourth new day but not on the third', () => {
    const two = new Set(['2025-01-06', '2025-01-07']);
    expect(checkEntitlement(queryOf(ADULT_THREE, { daysUsed: two })).allowed).toBe(true);
    const three = new Set(['2025-01-06', '2025-01-07', '2025-01-08']);
    expect(checkEntitlement(queryOf(ADULT_THREE, { daysUsed: three })).reason).toBe(
      'days_exhausted',
    );
  });

  it('still lets an exhausted ticket ride on a day it already counted', () => {
    const three = new Set(['2025-01-06', '2025-01-07', '2025-01-13']);
    const decision = checkEntitlement(queryOf(ADULT_THREE, { daysUsed: three }));
    expect(decision.allowed).toBe(true);
    expect(decision.consumesDay).toBe(false);
  });

  it('applies the daily entry cap on the products that carry one', () => {
    expect(
      checkEntitlement(queryOf(LESSON_CHILD, { lift: lift('CRPT'), entriesToday: 11 })).allowed,
    ).toBe(true);
    expect(
      checkEntitlement(queryOf(LESSON_CHILD, { lift: lift('CRPT'), entriesToday: 12 })).reason,
    ).toBe('entry_cap');
    expect(checkEntitlement(queryOf(ADULT_DAY, { entriesToday: 900 })).allowed).toBe(true);
  });
});

describe('days remaining', () => {
  it('counts down a ticket and never goes below zero', () => {
    expect(daysRemaining(ADULT_THREE, new Set())).toBe(3);
    expect(daysRemaining(ADULT_THREE, new Set(['a', 'b']))).toBe(1);
    expect(daysRemaining(ADULT_THREE, new Set(['a', 'b', 'c', 'd']))).toBe(0);
  });

  it('never counts down a season pass', () => {
    expect(daysRemaining(SEASON_UNRESTRICTED, new Set(['a', 'b']))).toBe(Number.POSITIVE_INFINITY);
  });
});
