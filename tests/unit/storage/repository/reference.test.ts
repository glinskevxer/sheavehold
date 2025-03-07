import { describe, expect, it } from 'vitest';
import { ReferenceStore } from '../../../../src/storage/repository/reference.js';
import { makeBinding } from '../../../../src/domain/media/binding.js';
import { parseMediaSerial, parsePrintedId } from '../../../../src/util/ids.js';
import { expect as expectOk } from '../../../../src/util/result.js';
import { ENTITLEMENTS, entitlement } from '../../../support/entitlements.js';
import { GUESTS } from '../../../support/guests.js';
import { ALL_MEDIA, CARD_ROW, CARD_TESS } from '../../../support/media.js';
import { ALL_PRODUCTS } from '../../../support/products.js';

const printed = (raw: string) => expectOk(parsePrintedId(raw), 'printed');
const serial = (raw: string) => expectOk(parseMediaSerial(raw), 'serial');

function loaded(): ReferenceStore {
  const store = new ReferenceStore();
  store.media.load(ALL_MEDIA);
  store.products.load(ALL_PRODUCTS);
  store.guests.load(GUESTS);
  store.entitlements.load(ENTITLEMENTS);
  store.loadBindings([
    expectOk(
      makeBinding({
        serial: CARD_ROW,
        entitlementId: 'ENT-1001',
        guestId: 'G-77',
        from: new Date('2024-11-22T00:00:00Z'),
      }),
      'binding',
    ),
    expectOk(
      makeBinding({
        serial: CARD_TESS,
        entitlementId: 'ENT-1002',
        guestId: 'G-78',
        from: new Date('2024-11-22T00:00:00Z'),
      }),
      'binding',
    ),
  ]);
  return store;
}

describe('the reference store', () => {
  it('holds every table and counts them', () => {
    expect(loaded().counts()).toEqual({
      media: 5,
      products: 8,
      guests: 6,
      entitlements: 4,
      bindings: 2,
    });
  });

  it('finds media by its printed number and its status', () => {
    const store = loaded();
    expect(store.media.by('printed', printed('4021-8830-1174'))[0]?.serial).toBe(CARD_ROW);
    expect(store.media.by('status', 'destroyed')).toHaveLength(1);
    expect(store.media.by('form', 'hard_card')).toHaveLength(5);
  });

  it('finds a product however the code was typed', () => {
    const store = loaded();
    expect(store.findProduct('seas')?.name).toBe('Season Pass');
    expect(store.findProduct(' aday ')?.code).toBe('ADAY');
    expect(store.findProduct('nope')).toBeUndefined();
    expect(store.products.by('kind', 'season')).toHaveLength(2);
  });

  it('groups guests by household and by postcode', () => {
    const store = loaded();
    expect(store.guests.by('household', 'HH-1')).toHaveLength(3);
    expect(store.guests.by('postcode', '81657')).toHaveLength(3);
    expect(store.guests.by('household', 'HH-9')).toEqual([]);
  });

  it('lists a guest entitlements in purchase order', () => {
    const store = loaded();
    store.entitlements.upsert(
      entitlement('ENT-9', 'ADAY', 'G-77', { purchasedAt: new Date('2025-02-01T17:00:00Z') }),
    );
    expect(store.entitlementsOfGuest('G-77').map((row) => row.id)).toEqual(['ENT-1001', 'ENT-9']);
    expect(store.entitlementsOfGuest('G-000')).toEqual([]);
  });

  it('builds the maps the pipeline wants', () => {
    const store = loaded();
    expect(store.entitlementMap().get('ENT-1001')?.productCode).toBe('SEAS');
    expect(store.mediaMap().get(CARD_ROW)?.printedId).toBe('4021-8830-1174');
  });

  it('resolves a printed number through the binding', () => {
    const store = loaded();
    expect(store.resolvePrinted(printed('4021-8830-1174'), new Date('2025-01-13T17:00:00Z'))).toBe(
      CARD_ROW,
    );
    expect(store.resolvePrinted(printed('9999-9999-9999'), new Date())).toBeUndefined();
  });

  it('still answers with the only card when nothing was bound', () => {
    const store = loaded();
    expect(store.resolvePrinted(printed('4021-8830-0001'), new Date())).toBe(
      serial('E2004A1B00000DEF'),
    );
  });
});

describe('checking the references hang together', () => {
  it('passes a store that lines up', () => {
    expect(loaded().danglingReferences()).toEqual([]);
  });

  it('finds an entitlement pointing at a missing product or guest', () => {
    const store = loaded();
    store.entitlements.upsert(entitlement('ENT-X', 'GONE', 'G-000'));
    expect(store.danglingReferences()).toEqual([
      'entitlement ENT-X names missing guest G-000',
      'entitlement ENT-X names missing product GONE',
    ]);
  });

  it('finds a binding on media nobody issued', () => {
    const store = loaded();
    store.media.delete(CARD_TESS);
    expect(store.danglingReferences()).toEqual([`binding names missing media ${CARD_TESS}`]);
  });
});
