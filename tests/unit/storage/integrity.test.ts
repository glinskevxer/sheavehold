import { describe, expect, it } from 'vitest';
import { checkIntegrity, summariseIntegrity } from '../../../src/storage/integrity.js';
import { checksumOf, makeEnvelope } from '../../../src/ingest/envelope.js';
import { expect as expectOk } from '../../../src/util/result.js';
import { entitlement } from '../../support/entitlements.js';
import { CARD_TESS } from '../../support/media.js';
import { loadedStores } from '../../support/store.js';
import { day } from '../../support/season.js';

const SPECS = [
  { at: '2025-01-13T17:00:00Z', terminal: 'SUNB.01' },
  { at: '2025-01-13T18:00:00Z', terminal: 'RIDGE.01' },
  { at: '2025-01-13T17:30:00Z', terminal: 'MEADW.01', media: CARD_TESS },
];

describe('a healthy store', () => {
  it('passes every check', () => {
    const report = checkIntegrity(loadedStores(SPECS));
    expect(report.healthy).toBe(true);
    expect(report.diagnostics.bySeverity('error')).toEqual([]);
    expect(report.checked).toBe(7);
  });

  it('summarises in a few lines', () => {
    const lines = summariseIntegrity(checkIntegrity(loadedStores(SPECS)));
    expect(lines).toContain('the store is consistent');
    expect(lines[0]).toBe('7 checks run');
  });
});

describe('what the check catches', () => {
  it('a ride with no scan behind it', () => {
    const stores = loadedStores(SPECS);
    const ride = stores.rides.rides.all()[0]!;
    stores.scans.scans.delete(`${ride.terminalId}#${String(ride.sequence).padStart(9, '0')}`);
    const report = checkIntegrity(stores);
    expect(report.healthy).toBe(false);
    expect(report.diagnostics.has('integrity.ride_without_scan')).toBe(true);
  });

  it('a visit whose ride count does not match', () => {
    const stores = loadedStores(SPECS);
    const visit = stores.rides.visits.all()[0]!;
    stores.rides.visits.upsert({ ...visit, rideCount: 99 });
    expect(checkIntegrity(stores).diagnostics.has('integrity.visit_ride_count')).toBe(true);
  });

  it('a visit whose vertical does not add up', () => {
    const stores = loadedStores(SPECS);
    const visit = stores.rides.visits.all()[0]!;
    stores.rides.visits.upsert({ ...visit, verticalFt: visit.verticalFt + 1 });
    expect(checkIntegrity(stores).diagnostics.has('integrity.visit_vertical')).toBe(true);
  });

  it('a day of rides with no scans at all', () => {
    const stores = loadedStores(SPECS);
    stores.scans.forgetDate(day('2025-01-13'));
    const report = checkIntegrity(stores);
    expect(report.diagnostics.has('integrity.rides_without_scans')).toBe(true);
  });

  it('an entitlement that has gone from the reference store', () => {
    const stores = loadedStores(SPECS);
    stores.reference.entitlements.delete('ENT-1001');
    const report = checkIntegrity(stores);
    expect(report.diagnostics.has('integrity.ride_entitlement')).toBe(true);
    expect(report.healthy).toBe(true);
  });

  it('a dangling reference in the ticket office data', () => {
    const stores = loadedStores(SPECS);
    stores.reference.entitlements.upsert(entitlement('ENT-X', 'GONE', 'G-000'));
    const report = checkIntegrity(stores);
    expect(report.diagnostics.has('integrity.dangling_reference')).toBe(true);
    expect(report.healthy).toBe(false);
  });

  it('a batch that was never taken in', () => {
    const stores = loadedStores(SPECS);
    const envelope = expectOk(
      makeEnvelope({
        batch: 'up-441',
        terminal: 'SUNB.01',
        uploaded: '2025-01-13T23:40:00Z',
        first: 1,
        last: 2,
        rows: 2,
        checksum: checksumOf([]),
        firmware: '4.11.2',
      }),
      'envelope',
    );
    stores.scans.recordBatch(envelope, false, new Date('2025-01-13T23:59:00Z'));
    const report = checkIntegrity(stores);
    expect(report.diagnostics.has('integrity.refused_batch')).toBe(true);
    expect(report.healthy).toBe(true);
  });

  it('counts the warnings separately from the problems', () => {
    const stores = loadedStores(SPECS);
    stores.reference.entitlements.delete('ENT-1001');
    const lines = summariseIntegrity(checkIntegrity(stores));
    expect(lines[1]).toBe('0 problems');
    expect(lines[2]).toContain('worth a look');
  });
});
