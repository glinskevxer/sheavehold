import { operatingDateRange, type OperatingDate } from '../util/clock.js';
import { distinctSorted, sumBy } from '../util/collect.js';
import { writeCsvTable } from '../util/csv.js';
import { crc32 } from '../storage/journal-format.js';
import { ageBandOn } from '../domain/guest/guest.js';
import type { Stores } from './stores.js';

/**
 * The extract the marketing agency gets. It has to be useful and it must not
 * carry anybody's name, so every guest is a stable pseudonym: the same person
 * hashes the same way across two extracts, which lets the agency measure a
 * cohort, and the hash cannot be turned back into a guest id without the salt.
 *
 * The salt is per extract and printed in the manifest, so the area can rerun
 * one and get the same pseudonyms, or change the salt and break the link.
 *
 * Anybody who has not opted in is not in the file at all.
 */

export interface ExtractRow {
  readonly pseudonym: string;
  readonly ageBand: string;
  readonly postcodePrefix: string;
  readonly daysSkied: number;
  readonly rides: number;
  readonly verticalFt: number;
  readonly liftsUsed: number;
  readonly firstDate: OperatingDate | undefined;
  readonly lastDate: OperatingDate | undefined;
}

export interface ExtractOptions {
  readonly from: OperatingDate;
  readonly to: OperatingDate;
  readonly salt: string;
  /** How much of the postcode to keep. Three digits is a town, not a street. */
  readonly postcodeDigits?: number | undefined;
}

export function pseudonymFor(guestId: string, salt: string): string {
  return `P-${crc32(`${salt}:${guestId}`)}`;
}

export function trimPostcode(postcode: string, digits: number): string {
  if (postcode === '') return '';
  return postcode.slice(0, Math.max(0, digits));
}

export function buildExtract(stores: Stores, options: ExtractOptions): ExtractRow[] {
  if (options.salt.trim() === '') throw new Error('an extract needs a salt');
  const digits = options.postcodeDigits ?? 3;
  const dates = new Set<string>(operatingDateRange(options.from, options.to));

  const rows: ExtractRow[] = [];
  for (const guest of stores.reference.guests.all()) {
    if (!guest.marketingOptIn) continue;
    const own = stores.rides.ridesOfGuest(guest.id).filter((ride) => dates.has(ride.operatingDate));
    if (own.length === 0) continue;

    const days = distinctSorted(own, (ride) => ride.operatingDate) as OperatingDate[];
    rows.push({
      pseudonym: pseudonymFor(guest.id, options.salt),
      ageBand: ageBandOn(guest, options.to) ?? 'unknown',
      postcodePrefix: trimPostcode(guest.postcode, digits),
      daysSkied: days.length,
      rides: own.length,
      verticalFt: sumBy(own, (ride) => ride.verticalFt),
      liftsUsed: distinctSorted(own, (ride) => ride.lift).length,
      firstDate: days[0],
      lastDate: days.at(-1),
    });
  }
  return rows.sort((a, b) => b.rides - a.rides || a.pseudonym.localeCompare(b.pseudonym));
}

const HEADER = [
  'pseudonym',
  'age_band',
  'postcode_prefix',
  'days_skied',
  'rides',
  'vertical_ft',
  'lifts_used',
  'first_date',
  'last_date',
] as const;

export function renderExtract(rows: readonly ExtractRow[]): string {
  return writeCsvTable(
    HEADER,
    rows.map((row) => ({
      pseudonym: row.pseudonym,
      age_band: row.ageBand,
      postcode_prefix: row.postcodePrefix,
      days_skied: String(row.daysSkied),
      rides: String(row.rides),
      vertical_ft: String(row.verticalFt),
      lifts_used: String(row.liftsUsed),
      first_date: row.firstDate ?? '',
      last_date: row.lastDate ?? '',
    })),
  );
}

export interface ExtractManifest {
  readonly from: OperatingDate;
  readonly to: OperatingDate;
  readonly salt: string;
  readonly rows: number;
  readonly optedOut: number;
  readonly checksum: string;
}

export function extractManifest(
  stores: Stores,
  options: ExtractOptions,
  rows: readonly ExtractRow[],
): ExtractManifest {
  const optedOut = stores.reference.guests.all().filter((guest) => !guest.marketingOptIn).length;
  return {
    from: options.from,
    to: options.to,
    salt: options.salt,
    rows: rows.length,
    optedOut,
    checksum: crc32(renderExtract(rows)),
  };
}

/** Anything in a row that could name somebody, which must always be nothing. */
export function identifyingFields(row: ExtractRow): string[] {
  return Object.entries(row)
    .filter(
      ([key, value]) => key !== 'pseudonym' && typeof value === 'string' && /G-\d+/.test(value),
    )
    .map(([key]) => key);
}
