import { describe, expect, it } from 'vitest';
import {
  beginnerLiftCodes,
  PROGRESSING_AFTER_RIDES,
  progressionRows,
  readProgression,
  summariseProgression,
} from '../../../src/service/progression.js';
import { recomputeDates } from '../../../src/service/recompute.js';
import { CARD_MILO, CARD_ROW, CARD_TESS } from '../../support/media.js';
import { harness, type Harness } from '../../support/service.js';
import { day } from '../../support/season.js';

function loaded(): Harness {
  const system = harness();
  system.ingest(
    [
      { at: '2025-01-13T17:00:00Z', seq: 1, terminal: 'CRPT.01', media: CARD_MILO },
      { at: '2025-01-13T17:20:00Z', seq: 2, terminal: 'CRPT.01', media: CARD_MILO },
    ],
    { batch: 'up-crpt', terminal: 'CRPT.01' },
  );
  system.ingest([{ at: '2025-01-13T17:10:00Z', seq: 1, terminal: 'MEADW.01', media: CARD_TESS }], {
    batch: 'up-meadw',
    terminal: 'MEADW.01',
  });
  system.ingest(
    [
      { at: '2025-01-15T17:00:00Z', seq: 1, terminal: 'SUNB.01', media: CARD_TESS },
      { at: '2025-01-13T18:00:00Z', seq: 2, terminal: 'SUNB.01', media: CARD_ROW },
    ],
    { batch: 'up-sunb', terminal: 'SUNB.01' },
  );
  recomputeDates([day('2025-01-13'), day('2025-01-14'), day('2025-01-15')], system);
  return system;
}

describe('who counts as a beginner', () => {
  it('names the beginner lifts', () => {
    expect([...beginnerLiftCodes(loaded().lifts)].sort()).toEqual(['CRPT', 'MEADW']);
  });

  it('takes somebody whose first ride was on a beginner lift', () => {
    const system = loaded();
    const rides = system.rides.ridesOfGuest('G-79');
    expect(readProgression('G-79', rides, beginnerLiftCodes(system.lifts))?.firstLift).toBe('CRPT');
  });

  it('leaves out somebody who started on a real lift', () => {
    const system = loaded();
    const rides = system.rides.ridesOfGuest('G-77');
    expect(readProgression('G-77', rides, beginnerLiftCodes(system.lifts))).toBeUndefined();
  });

  it('answers nothing for somebody with no rides', () => {
    expect(readProgression('G-93', [], new Set(['CRPT']))).toBeUndefined();
  });
});

describe('the stages', () => {
  it('calls a first timer with one ride a beginner', () => {
    const system = loaded();
    const rides = system.rides.ridesOfGuest('G-78').slice(0, 1);
    expect(readProgression('G-78', rides, beginnerLiftCodes(system.lifts))?.stage).toBe('beginner');
  });

  it('calls somebody with a few carpet rides progressing', () => {
    const system = loaded();
    const row = readProgression(
      'G-79',
      system.rides.ridesOfGuest('G-79'),
      beginnerLiftCodes(system.lifts),
    );
    expect(row?.beginnerRides).toBe(2);
    expect(row?.stage).toBe('progressing');
    expect(PROGRESSING_AFTER_RIDES).toBe(2);
  });

  it('calls somebody who rode a real lift graduated, and dates it', () => {
    const system = loaded();
    const row = readProgression(
      'G-78',
      system.rides.ridesOfGuest('G-78'),
      beginnerLiftCodes(system.lifts),
    );
    expect(row?.stage).toBe('graduated');
    expect(row?.graduatedOn).toBe('2025-01-15');
    expect(row?.daysToGraduate).toBe(2);
  });
});

describe('the whole cohort', () => {
  it('gives a row per beginner, earliest first', () => {
    expect(progressionRows(loaded()).map((row) => row.guestId)).toEqual(['G-78', 'G-79']);
  });

  it('summarises the stages and the conversion', () => {
    const summary = summariseProgression(progressionRows(loaded()));
    expect(summary).toMatchObject({ beginners: 0, progressing: 1, graduated: 1 });
    expect(summary.conversionPercent).toBe(50);
    expect(summary.medianDaysToGraduate).toBe(2);
  });

  it('lists the days beginners first came out', () => {
    expect(summariseProgression(progressionRows(loaded())).firstDates).toEqual(['2025-01-13']);
  });

  it('gives zeroes for a cohort of nobody', () => {
    const summary = summariseProgression([]);
    expect(summary.conversionPercent).toBe(0);
    expect(summary.medianDaysToGraduate).toBeUndefined();
    expect(summary.firstDates).toEqual([]);
  });
});
