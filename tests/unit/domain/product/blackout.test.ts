import { describe, expect, it } from 'vitest';
import {
  BlackoutRegistry,
  makeBlackout,
  windowCovers,
  windowDates,
  type BlackoutInput,
  type BlackoutWindow,
} from '../../../../src/domain/product/blackout.js';
import type { DayClass } from '../../../../src/domain/calendar/season.js';
import { expect as expectOk, isErr } from '../../../../src/util/result.js';
import { ADULT_DAY, SEASON_MIDWEEK, SEASON_UNRESTRICTED } from '../../../support/products.js';
import { calendar2024, day } from '../../../support/season.js';

const ANNOUNCED = new Date('2024-11-01T16:00:00Z');

function windowOf(overrides: Partial<BlackoutInput> = {}): BlackoutWindow {
  return expectOk(
    makeBlackout({
      id: 'BW-XMAS',
      label: 'christmas peak',
      from: day('2024-12-26'),
      to: day('2025-01-01'),
      announcedAt: ANNOUNCED,
      ...overrides,
    }),
    'blackout',
  );
}

const query = {
  product: SEASON_UNRESTRICTED,
  entitlementId: 'ENT-1',
  date: day('2024-12-28'),
  dayClass: 'peak' as DayClass,
  purchasedAt: new Date('2024-11-20T16:00:00Z'),
};

describe('a blackout window', () => {
  it('sorts its lists so two spellings compare the same', () => {
    const window = windowOf({ productCodes: ['seas', 'ADAY'], exemptEntitlements: ['b', 'a'] });
    expect(window.productCodes).toEqual(['ADAY', 'SEAS']);
    expect(window.exemptEntitlements).toEqual(['a', 'b']);
  });

  it('refuses an unnamed window or one that ends first', () => {
    expect(isErr(makeBlackout({ ...windowOf(), id: ' ' }))).toBe(true);
    expect(isErr(makeBlackout({ ...windowOf(), label: ' ' }))).toBe(true);
    expect(
      isErr(makeBlackout({ ...windowOf(), from: day('2025-01-01'), to: day('2024-12-26') })),
    ).toBe(true);
    expect(isErr(makeBlackout({ ...windowOf(), announcedAt: new Date('nope') }))).toBe(true);
  });

  it('covers its own dates inclusive at both ends', () => {
    const window = windowOf();
    expect(windowCovers(window, day('2024-12-26'))).toBe(true);
    expect(windowCovers(window, day('2025-01-01'))).toBe(true);
    expect(windowCovers(window, day('2024-12-25'))).toBe(false);
    expect(windowDates(window)).toHaveLength(7);
  });
});

describe('the registry', () => {
  it('bites on a pass bought after the announcement', () => {
    const registry = BlackoutRegistry.from([windowOf()]);
    expect(registry.check(query)?.windowId).toBe('BW-XMAS');
  });

  it('lets a pass bought before the announcement through', () => {
    const registry = BlackoutRegistry.from([windowOf()]);
    const early = { ...query, purchasedAt: new Date('2024-10-01T16:00:00Z') };
    expect(registry.check(early)).toBeUndefined();
  });

  it('lets a named exemption through', () => {
    const registry = BlackoutRegistry.from([windowOf({ exemptEntitlements: ['ENT-1'] })]);
    expect(registry.check(query)).toBeUndefined();
    expect(registry.check({ ...query, entitlementId: 'ENT-2' })?.label).toBe('christmas peak');
  });

  it('only bites the products it names', () => {
    const registry = BlackoutRegistry.from([windowOf({ productCodes: ['ADAY'] })]);
    expect(registry.check(query)).toBeUndefined();
    expect(registry.check({ ...query, product: ADULT_DAY })?.windowId).toBe('BW-XMAS');
  });

  it('leaves the classes it excepts alone', () => {
    const registry = BlackoutRegistry.from([windowOf({ exceptClasses: ['midweek'] })]);
    expect(registry.check({ ...query, dayClass: 'midweek' })).toBeUndefined();
    expect(registry.check(query)?.windowId).toBe('BW-XMAS');
  });

  it('misses a date outside every window', () => {
    const registry = BlackoutRegistry.from([windowOf()]);
    expect(registry.check({ ...query, date: day('2025-02-10') })).toBeUndefined();
  });

  it('reports the first window in date order when two overlap', () => {
    const registry = BlackoutRegistry.from([
      windowOf({
        id: 'BW-LATE',
        from: day('2024-12-28'),
        to: day('2025-01-05'),
        label: 'new year',
      }),
      windowOf(),
    ]);
    expect(registry.check(query)?.windowId).toBe('BW-XMAS');
    expect(registry.size).toBe(2);
  });

  it('refuses the same window id twice', () => {
    const registry = BlackoutRegistry.from([windowOf()]);
    expect(() => registry.add(windowOf())).toThrow('listed twice');
  });

  it('lists the windows live on one date', () => {
    const registry = BlackoutRegistry.from([
      windowOf(),
      windowOf({ id: 'BW-PRES', from: day('2025-02-15'), to: day('2025-02-17') }),
    ]);
    expect(registry.windowsFor(day('2024-12-28')).map((w) => w.id)).toEqual(['BW-XMAS']);
    expect(registry.windowsFor(day('2025-03-01'))).toEqual([]);
  });

  it('lays the blacked out dates out for the rate card', () => {
    const calendar = calendar2024();
    const registry = BlackoutRegistry.from([
      windowOf({ productCodes: ['SEASMW'], exceptClasses: ['midweek'] }),
    ]);
    const dates = registry.blackedOutDates(
      SEASON_MIDWEEK.code,
      (date) => calendar.plan(date).dayClass,
    );
    expect(dates).toEqual([
      '2024-12-26',
      '2024-12-27',
      '2024-12-28',
      '2024-12-29',
      '2024-12-30',
      '2024-12-31',
      '2025-01-01',
    ]);
    expect(registry.blackedOutDates('ADAY', (date) => calendar.plan(date).dayClass)).toEqual([]);
  });
});
