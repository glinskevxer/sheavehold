import { normaliseScans } from '../../src/domain/scan/normalise.js';
import { buildVisits } from '../../src/domain/visit/visit.js';
import { ReferenceStore } from '../../src/storage/repository/reference.js';
import { RideStore } from '../../src/storage/repository/rides.js';
import { ScanStore } from '../../src/storage/repository/scans.js';
import { makeBinding, type Binding } from '../../src/domain/media/binding.js';
import { expect as expectOk } from '../../src/util/result.js';
import { ENTITLEMENTS } from './entitlements.js';
import { GUESTS } from './guests.js';
import { ALL_MEDIA, CARD_IDA, CARD_MILO, CARD_ROW, CARD_TESS } from './media.js';
import { ALL_PRODUCTS } from './products.js';
import { rawFrom, ridesFrom, type ScanSpec } from './pipeline.js';
import { clocks, rawScan, terminals } from './scans.js';
import { day } from './season.js';

function bind(serial: string, entitlementId: string, guestId: string): Binding {
  return expectOk(
    makeBinding({
      serial: serial as never,
      entitlementId,
      guestId,
      from: new Date('2024-11-22T00:00:00Z'),
    }),
    'binding',
  );
}

export function referenceStore(): ReferenceStore {
  const store = new ReferenceStore();
  store.media.load(ALL_MEDIA);
  store.products.load(ALL_PRODUCTS);
  store.guests.load(GUESTS);
  store.entitlements.load(ENTITLEMENTS);
  store.loadBindings([
    bind(CARD_ROW, 'ENT-1001', 'G-77'),
    bind(CARD_TESS, 'ENT-1002', 'G-78'),
    bind(CARD_MILO, 'ENT-1003', 'G-79'),
    bind(CARD_IDA, 'ENT-2001', 'G-91'),
  ]);
  return store;
}

export interface LoadedStores {
  reference: ReferenceStore;
  scans: ScanStore;
  rides: RideStore;
}

/** A store holding one day, built the way the service would build it. */
export function loadedStores(specs: readonly ScanSpec[]): LoadedStores {
  const scanStore = new ScanStore();
  const rideStore = new RideStore();
  const normalised = normaliseScans(
    rawFrom(specs).map((row) => rawScan(row)),
    { clocks: clocks(), terminals: terminals() },
  );
  scanStore.record(normalised);
  const rides = ridesFrom(specs);
  rideStore.replaceDate(day('2025-01-13'), rides, buildVisits(rides));
  return { reference: referenceStore(), scans: scanStore, rides: rideStore };
}
