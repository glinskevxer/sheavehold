import { describe, expect, it } from 'vitest';
import { ingestUpload } from '../../src/service/ingest.js';
import { recomputeDate } from '../../src/service/recompute.js';
import { checkIntegrity } from '../../src/storage/integrity.js';
import { expect as expectOk } from '../../src/util/result.js';
import { CARD_ROW, CARD_TESS } from '../support/media.js';
import { harness } from '../support/service.js';
import { day } from '../support/season.js';
import { ingestContext, uploadFile } from '../support/uploads.js';

/**
 * The overnight job is a shell script on a box in an unheated room and it has
 * been run twice by hand more than once. The property that makes that safe is
 * that an upload is keyed on the gate and its counter, so taking the same file
 * in again lands on the same rows.
 *
 * This test is the one that would have caught the season where a re-run doubled
 * the Boxing Day skier visits.
 */

const date = day('2025-01-13');

const ROWS = [
  { at: '2025-01-13T16:05:00Z', seq: 1, media: CARD_ROW },
  { at: '2025-01-13T16:40:00Z', seq: 2, media: CARD_ROW },
  { at: '2025-01-13T17:20:00Z', seq: 3, media: CARD_ROW },
];

function loaded() {
  const system = harness();
  system.ingest(ROWS, { batch: 'up-sunb', terminal: 'SUNB.01' });
  system.ingest([{ at: '2025-01-13T17:00:00Z', seq: 1, terminal: 'MEADW.01', media: CARD_TESS }], {
    batch: 'up-meadw',
    terminal: 'MEADW.01',
  });
  recomputeDate(date, system);
  return system;
}

describe('taking the same upload in twice', () => {
  it('keeps the scan count the same', () => {
    const system = loaded();
    expect(system.scans.countOnDate(date)).toBe(4);
    system.ingest(ROWS, { batch: 'up-sunb', terminal: 'SUNB.01' });
    expect(system.scans.countOnDate(date)).toBe(4);
  });

  it('keeps the rides, the visits and the vertical the same', () => {
    const system = loaded();
    const before = {
      rides: system.rides.ridesOn(date).length,
      visits: system.rides.skierVisitsOn(date),
      vertical: system.rides.verticalOn(date),
    };
    system.ingest(ROWS, { batch: 'up-sunb', terminal: 'SUNB.01' });
    recomputeDate(date, system);
    expect({
      rides: system.rides.ridesOn(date).length,
      visits: system.rides.skierVisitsOn(date),
      vertical: system.rides.verticalOn(date),
    }).toEqual(before);
  });

  it('keeps the ride ids stable so an exception decision survives', () => {
    const system = loaded();
    const before = system.rides.ridesOn(date).map((ride) => ride.id);
    system.ingest(ROWS, { batch: 'up-sunb', terminal: 'SUNB.01' });
    recomputeDate(date, system);
    expect(system.rides.ridesOn(date).map((ride) => ride.id)).toEqual(before);
  });

  it('says the batch has been in before rather than staying quiet', () => {
    const context = ingestContext();
    const file = uploadFile(ROWS, { batch: 'up-sunb', terminal: 'SUNB.01' });
    expectOk(ingestUpload(file, context), 'first');
    const again = expectOk(ingestUpload(file, context), 'second');
    expect(again.replay).toBe(true);
    expect(again.rowsStored).toBe(0);
    expect(again.rowsReplaced).toBe(3);
    expect(again.diagnostics.has('ingest.seen_before')).toBe(true);
  });

  it('does not count the same rows against the day counter twice', () => {
    const system = loaded();
    system.ingest(ROWS, { batch: 'up-sunb', terminal: 'SUNB.01' });
    recomputeDate(date, system);
    expect(system.rides.daysUsedBy('ENT-1002')).toEqual(['2025-01-13']);
  });

  it('leaves the store consistent afterwards', () => {
    const system = loaded();
    system.ingest(ROWS, { batch: 'up-sunb', terminal: 'SUNB.01' });
    recomputeDate(date, system);
    expect(
      checkIntegrity({
        reference: system.reference,
        scans: system.scans,
        rides: system.rides,
      }).healthy,
    ).toBe(true);
  });

  it('takes a corrected re-upload that adds a row', () => {
    const system = loaded();
    system.ingest([...ROWS, { at: '2025-01-13T18:00:00Z', seq: 4, media: CARD_ROW }], {
      batch: 'up-sunb',
      terminal: 'SUNB.01',
    });
    recomputeDate(date, system);
    expect(system.scans.countOnDate(date)).toBe(5);
    expect(system.rides.ridesOn(date)).toHaveLength(5);
  });

  it('takes a corrected re-upload that changes a row in place', () => {
    const system = loaded();
    const changed = ROWS.map((row) =>
      row.seq === 2 ? { ...row, at: '2025-01-13T16:45:00Z' } : row,
    );
    system.ingest(changed, { batch: 'up-sunb', terminal: 'SUNB.01' });
    recomputeDate(date, system);
    expect(system.scans.countOnDate(date)).toBe(4);
    const second = system.scans.onDate(date).find((scan) => scan.sequence === 2);
    expect(second?.reportedAt.toISOString()).toBe('2025-01-13T16:45:00.000Z');
  });

  it('recomputing twice with no new uploads changes nothing', () => {
    const system = loaded();
    const before = system.rides.ridesOn(date).map((ride) => ride.id);
    recomputeDate(date, system);
    recomputeDate(date, system);
    expect(system.rides.ridesOn(date).map((ride) => ride.id)).toEqual(before);
  });
});
