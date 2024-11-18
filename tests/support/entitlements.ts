import { makeEntitlement, type Entitlement } from '../../src/domain/product/entitlement.js';
import { BlackoutRegistry, makeBlackout } from '../../src/domain/product/blackout.js';
import { ProductCatalogue } from '../../src/domain/product/product.js';
import { expect as expectOk } from '../../src/util/result.js';
import { ALL_PRODUCTS } from './products.js';
import { day } from './season.js';

export function entitlement(
  id: string,
  productCode: string,
  guestId: string,
  overrides: Partial<Parameters<typeof makeEntitlement>[0]> = {},
): Entitlement {
  return expectOk(
    makeEntitlement({
      id,
      productCode,
      guestId,
      purchasedAt: new Date('2024-11-20T17:00:00Z'),
      pricePaidCents: 12_900,
      ...overrides,
    }),
    'entitlement',
  );
}

export const ENTITLEMENTS: readonly Entitlement[] = [
  entitlement('ENT-1001', 'SEAS', 'G-77', { pricePaidCents: 89_900 }),
  entitlement('ENT-1002', 'A3DAY', 'G-78', { pricePaidCents: 34_500 }),
  entitlement('ENT-1003', 'BEG', 'G-79', { pricePaidCents: 5_900 }),
  entitlement('ENT-2001', 'SEASMW', 'G-91', { pricePaidCents: 44_900 }),
];

export function entitlementMap(): Map<string, Entitlement> {
  return new Map(ENTITLEMENTS.map((entry) => [entry.id, entry]));
}

export function catalogue(): ProductCatalogue {
  return ProductCatalogue.from(ALL_PRODUCTS);
}

export function blackouts(): BlackoutRegistry {
  return BlackoutRegistry.from([
    expectOk(
      makeBlackout({
        id: 'BW-XMAS',
        label: 'christmas peak',
        from: day('2024-12-26'),
        to: day('2025-01-01'),
        productCodes: ['A3DAY'],
        announcedAt: new Date('2024-11-01T16:00:00Z'),
      }),
      'blackout',
    ),
  ]);
}
