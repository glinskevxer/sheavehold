import { makeProduct, type Product, type ProductInput } from '../../src/domain/product/product.js';
import { expect as expectOk } from '../../src/util/result.js';

const DEFAULTS: ProductInput = {
  code: 'ADAY',
  name: 'Adult Day Ticket',
  kind: 'day',
  ageBand: 'adult',
  listPriceCents: 12_900,
  dayCount: 1,
  validFrom: '2024-11-22',
  validTo: '2025-04-13',
};

export function productOf(overrides: Partial<ProductInput> = {}): Product {
  return expectOk(makeProduct({ ...DEFAULTS, ...overrides }), 'product');
}

export const ADULT_DAY = productOf();

export const ADULT_THREE = productOf({
  code: 'A3DAY',
  name: 'Adult Three Day',
  kind: 'multi_day',
  listPriceCents: 34_500,
  dayCount: 3,
});

export const SEASON_UNRESTRICTED = productOf({
  code: 'SEAS',
  name: 'Season Pass',
  kind: 'season',
  listPriceCents: 89_900,
  dayCount: 0,
});

export const SEASON_MIDWEEK = productOf({
  code: 'SEASMW',
  name: 'Midweek Season Pass',
  kind: 'season',
  listPriceCents: 44_900,
  dayCount: 0,
  blackoutClasses: ['weekend', 'holiday', 'peak'],
});

export const BEGINNER_DAY = productOf({
  code: 'BEG',
  name: 'Beginner Lifts Day Ticket',
  kind: 'day',
  listPriceCents: 5_900,
  lifts: ['MEADW', 'CRPT'],
});

export const LESSON_CHILD = productOf({
  code: 'LSNCH',
  name: 'Child Lesson Ticket',
  kind: 'lesson',
  ageBand: 'child',
  listPriceCents: 0,
  dayCount: 1,
  lifts: ['CRPT'],
  dailyEntryCap: 12,
});

export const EMPLOYEE = productOf({
  code: 'EMP',
  name: 'Employee Pass',
  kind: 'employee',
  listPriceCents: 0,
  dayCount: 0,
});

export const COMP_DAY = productOf({
  code: 'COMP',
  name: 'Comp Day',
  kind: 'comp',
  listPriceCents: 0,
  dayCount: 1,
});

export const ALL_PRODUCTS: readonly Product[] = [
  ADULT_DAY,
  ADULT_THREE,
  SEASON_UNRESTRICTED,
  SEASON_MIDWEEK,
  BEGINNER_DAY,
  LESSON_CHILD,
  EMPLOYEE,
  COMP_DAY,
];
