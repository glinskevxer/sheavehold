import type { Entitlement } from '../../domain/product/entitlement.js';
import type { Product } from '../../domain/product/product.js';
import type { Guest } from '../../domain/guest/guest.js';
import type { Media } from '../../domain/media/media.js';
import type { Binding } from '../../domain/media/binding.js';
import { BindingLedger } from '../../domain/media/binding.js';
import type { MediaSerial, PrintedId } from '../../util/ids.js';
import { Table } from '../table.js';

/**
 * Everything the point of sale owns. It changes slowly, it is small, and every
 * stage of the ingest reads it, so it sits in tables with the indexes those
 * stages actually use rather than being walked each time.
 *
 * The binding ledger is not a table. Resolving a serial needs the interval
 * search it already does, and duplicating that on top of a generic index gave
 * two answers that disagreed at a handover minute.
 */

export class ReferenceStore {
  readonly media = new Table<Media>({
    name: 'media',
    primaryKey: (row) => row.serial,
    indexes: [
      { name: 'printed', keys: (row) => [row.printedId] },
      { name: 'status', keys: (row) => [row.status] },
      { name: 'form', keys: (row) => [row.form] },
    ],
  });

  readonly products = new Table<Product>({
    name: 'products',
    primaryKey: (row) => row.code,
    indexes: [
      { name: 'kind', keys: (row) => [row.kind] },
      { name: 'age_band', keys: (row) => [row.ageBand] },
    ],
  });

  readonly guests = new Table<Guest>({
    name: 'guests',
    primaryKey: (row) => row.id,
    indexes: [
      {
        name: 'household',
        keys: (row) => (row.householdId === undefined ? [] : [row.householdId]),
      },
      { name: 'postcode', keys: (row) => (row.postcode === '' ? [] : [row.postcode]) },
    ],
  });

  readonly entitlements = new Table<Entitlement>({
    name: 'entitlements',
    primaryKey: (row) => row.id,
    indexes: [
      { name: 'guest', keys: (row) => [row.guestId] },
      { name: 'product', keys: (row) => [row.productCode] },
    ],
  });

  bindings = new BindingLedger();

  loadBindings(bindings: readonly Binding[]): void {
    this.bindings = BindingLedger.from(bindings);
  }

  /** The serial a printed number was on at a moment, for the legacy reader. */
  resolvePrinted(printed: PrintedId, at: Date): MediaSerial | undefined {
    for (const candidate of this.media.by('printed', printed)) {
      const binding = this.bindings.resolve(candidate.serial, at);
      if (binding !== undefined) return candidate.serial;
    }
    const only = this.media.by('printed', printed)[0];
    return only?.serial;
  }

  entitlementsOfGuest(guestId: string): Entitlement[] {
    return this.entitlements
      .by('guest', guestId)
      .sort((a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime());
  }

  entitlementMap(): Map<string, Entitlement> {
    return new Map(this.entitlements.all().map((row) => [row.id, row]));
  }

  mediaMap(): Map<string, Media> {
    return new Map(this.media.all().map((row) => [row.serial, row]));
  }

  findProduct(code: string): Product | undefined {
    return this.products.get(code.trim().toUpperCase());
  }

  /** Rows that point at something not on file, which stops an ingest cold. */
  danglingReferences(): string[] {
    const problems: string[] = [];
    for (const entitlement of this.entitlements.all()) {
      if (!this.products.has(entitlement.productCode)) {
        problems.push(
          `entitlement ${entitlement.id} names missing product ${entitlement.productCode}`,
        );
      }
      if (!this.guests.has(entitlement.guestId)) {
        problems.push(`entitlement ${entitlement.id} names missing guest ${entitlement.guestId}`);
      }
    }
    for (const serial of this.bindings.serials()) {
      if (!this.media.has(serial)) {
        problems.push(`binding names missing media ${serial}`);
      }
    }
    return problems.sort();
  }

  counts(): Record<string, number> {
    return {
      media: this.media.size,
      products: this.products.size,
      guests: this.guests.size,
      entitlements: this.entitlements.size,
      bindings: this.bindings.size,
    };
  }
}
