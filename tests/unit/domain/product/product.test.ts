import { describe, expect, it } from 'vitest';
import {
  ALL_LIFTS_SCOPE,
  blacksOut,
  describeScope,
  isAgeBand,
  isProductKind,
  isUnlimited,
  listedScope,
  makeProduct,
  nominalDayValue,
  ProductCatalogue,
  scopeCovers,
} from '../../../../src/domain/product/product.js';
import { parseLiftCode, type LiftCode } from '../../../../src/util/ids.js';
import { expect as expectOk, isErr } from '../../../../src/util/result.js';
import {
  ADULT_DAY,
  ADULT_THREE,
  ALL_PRODUCTS,
  BEGINNER_DAY,
  EMPLOYEE,
  productOf,
  SEASON_MIDWEEK,
  SEASON_UNRESTRICTED,
} from '../../../support/products.js';

const lift = (raw: string): LiftCode => expectOk(parseLiftCode(raw), 'lift');

describe('lift scope', () => {
  it('lets everything through when the scope is everything', () => {
    expect(scopeCovers(ALL_LIFTS_SCOPE, lift('SUNB'))).toBe(true);
    expect(describeScope(ALL_LIFTS_SCOPE)).toBe('every lift');
  });

  it('sorts a listed scope so two orderings compare the same', () => {
    const scope = listedScope([lift('MEADW'), lift('CRPT')]);
    expect(describeScope(scope)).toBe('CRPT, MEADW');
    expect(scopeCovers(scope, lift('CRPT'))).toBe(true);
    expect(scopeCovers(scope, lift('SUNB'))).toBe(false);
  });
});

describe('building a product', () => {
  it('folds the code and trims the name', () => {
    const product = productOf({ code: ' aday ', name: '  Adult Day Ticket ' });
    expect(product.code).toBe('ADAY');
    expect(product.name).toBe('Adult Day Ticket');
  });

  it('recognises the kinds and the age bands', () => {
    expect(isProductKind('nordic')).toBe(true);
    expect(isProductKind('helicopter')).toBe(false);
    expect(isAgeBand('super_senior')).toBe(true);
    expect(isAgeBand('toddler')).toBe(false);
  });

  it('defaults transferable off for the passes nobody may lend', () => {
    expect(ADULT_DAY.transferable).toBe(true);
    expect(EMPLOYEE.transferable).toBe(false);
    expect(
      productOf({ code: 'EMP2', kind: 'employee', dayCount: 0, transferable: true }).transferable,
    ).toBe(true);
  });

  it('refuses a code that is not short and loud', () => {
    expect(
      isErr(
        makeProduct({
          ...ADULT_DAY,
          code: 'ab',
          listPriceCents: 1,
          validFrom: '2024-11-22',
          validTo: '2025-04-13',
        }),
      ),
    ).toBe(true);
  });

  it('refuses a day ticket good for two days and a multi day good for one', () => {
    expect(isErr(makeProduct({ ...toInput(ADULT_DAY), dayCount: 2 }))).toBe(true);
    expect(isErr(makeProduct({ ...toInput(ADULT_THREE), dayCount: 1 }))).toBe(true);
  });

  it('refuses a season pass with a day count', () => {
    expect(isErr(makeProduct({ ...toInput(SEASON_UNRESTRICTED), dayCount: 40 }))).toBe(true);
  });

  it('refuses a validity window that closes before it opens', () => {
    expect(
      isErr(makeProduct({ ...toInput(ADULT_DAY), validFrom: '2025-04-13', validTo: '2024-11-22' })),
    ).toBe(true);
  });

  it('refuses an empty lift list, a bad lift and a negative price', () => {
    expect(isErr(makeProduct({ ...toInput(BEGINNER_DAY), lifts: [] }))).toBe(true);
    expect(isErr(makeProduct({ ...toInput(BEGINNER_DAY), lifts: ['nope1'] }))).toBe(true);
    expect(isErr(makeProduct({ ...toInput(ADULT_DAY), listPriceCents: -1 }))).toBe(true);
    expect(isErr(makeProduct({ ...toInput(ADULT_DAY), dailyEntryCap: -3 }))).toBe(true);
    expect(isErr(makeProduct({ ...toInput(ADULT_DAY), name: '  ' }))).toBe(true);
  });
});

function toInput(product: (typeof ALL_PRODUCTS)[number]) {
  return {
    code: product.code,
    name: product.name,
    kind: product.kind,
    ageBand: product.ageBand,
    listPriceCents: product.listPrice as number,
    dayCount: product.dayCount,
    validFrom: product.validFrom as string,
    validTo: product.validTo as string,
  };
}

describe('what a product allows', () => {
  it('knows an unlimited product from a counted one', () => {
    expect(isUnlimited(SEASON_UNRESTRICTED)).toBe(true);
    expect(isUnlimited(ADULT_THREE)).toBe(false);
  });

  it('reads the blackout classes', () => {
    expect(blacksOut(SEASON_MIDWEEK, 'weekend')).toBe(true);
    expect(blacksOut(SEASON_MIDWEEK, 'midweek')).toBe(false);
    expect(blacksOut(SEASON_UNRESTRICTED, 'peak')).toBe(false);
  });

  it('sorts the blackout classes so two orders compare equal', () => {
    const one = productOf({
      code: 'XONE',
      kind: 'season',
      dayCount: 0,
      blackoutClasses: ['peak', 'weekend'],
    });
    const two = productOf({
      code: 'XTWO',
      kind: 'season',
      dayCount: 0,
      blackoutClasses: ['weekend', 'peak'],
    });
    expect(one.blackoutClasses).toEqual(two.blackoutClasses);
  });

  it('splits a counted product over its own days', () => {
    expect(nominalDayValue(ADULT_THREE, 99)).toBe(11_500);
    expect(nominalDayValue(ADULT_DAY, 99)).toBe(12_900);
  });

  it('splits an unlimited product over the days it was actually used', () => {
    expect(nominalDayValue(SEASON_UNRESTRICTED, 20)).toBe(4_495);
    expect(nominalDayValue(SEASON_UNRESTRICTED, 0)).toBe(89_900);
  });
});

describe('the catalogue', () => {
  const catalogue = ProductCatalogue.from(ALL_PRODUCTS);

  it('finds a product however the code was typed', () => {
    expect(catalogue.find('seas')).toBe(SEASON_UNRESTRICTED);
    expect(catalogue.find(' ADAY ')).toBe(ADULT_DAY);
    expect(catalogue.find('NOPE')).toBeUndefined();
    expect(catalogue.size).toBe(8);
  });

  it('refuses the same code twice', () => {
    expect(() => catalogue.add(ADULT_DAY)).toThrow('listed twice');
  });

  it('lists in code order and filters by kind', () => {
    expect(catalogue.all().map((product) => product.code)).toEqual([
      'A3DAY',
      'ADAY',
      'BEG',
      'COMP',
      'EMP',
      'LSNCH',
      'SEAS',
      'SEASMW',
    ]);
    expect(catalogue.ofKind('season').map((product) => product.code)).toEqual(['SEAS', 'SEASMW']);
    expect(catalogue.ofKind('nordic')).toEqual([]);
  });
});
