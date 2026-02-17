import { describe, expect, it } from 'vitest';
import {
  allHouseholds,
  lopsidedHouseholds,
  membersByBand,
  rollUpHousehold,
  type HouseholdContext,
} from '../../../src/service/household.js';
import { recomputeDates } from '../../../src/service/recompute.js';
import { CARD_MILO, CARD_TESS } from '../../support/media.js';
import { harness } from '../../support/service.js';
import { day } from '../../support/season.js';

function loaded(): HouseholdContext {
  const system = harness();
  system.ingest([
    { at: '2025-01-13T17:00:00Z', seq: 1, terminal: 'SUNB.01' },
    { at: '2025-01-13T18:00:00Z', seq: 2, terminal: 'SUNB.01' },
    { at: '2025-01-15T17:00:00Z', seq: 3, terminal: 'SUNB.01' },
  ]);
  system.ingest(
    [
      { at: '2025-01-13T17:30:00Z', seq: 1, terminal: 'MEADW.01', media: CARD_TESS },
      { at: '2025-01-14T17:30:00Z', seq: 2, terminal: 'MEADW.01', media: CARD_TESS },
    ],
    { batch: 'up-2', terminal: 'MEADW.01' },
  );
  system.ingest([{ at: '2025-01-13T17:45:00Z', seq: 1, terminal: 'CRPT.01', media: CARD_MILO }], {
    batch: 'up-3',
    terminal: 'CRPT.01',
  });
  recomputeDates([day('2025-01-13'), day('2025-01-14'), day('2025-01-15')], system);
  return { reference: system.reference, rides: system.rides, asOf: day('2025-01-15') };
}

describe('rolling one household up', () => {
  it('lists every member, most days first', () => {
    const roll = rollUpHousehold('HH-1', loaded());
    expect(roll?.members.map((member) => member.guestId)).toEqual(['G-77', 'G-78', 'G-79']);
    expect(roll?.members[0]?.daysSkied).toBe(2);
  });

  it('names the member who books', () => {
    expect(rollUpHousehold('HH-1', loaded())?.anchor).toBe('G-77');
  });

  it('adds the rides, the vertical and the money', () => {
    const roll = rollUpHousehold('HH-1', loaded());
    expect(roll?.rides).toBe(6);
    expect(roll?.verticalFt).toBe(1240 * 3 + 380 * 2 + 52);
    expect(roll?.spend).toBeGreaterThan(0);
    expect(roll?.spendFormatted.startsWith('$')).toBe(true);
  });

  it('counts the days more than one of them was out', () => {
    const roll = rollUpHousehold('HH-1', loaded());
    expect(roll?.distinctDays).toBe(3);
    expect(roll?.daysSkiedTogether).toBe(1);
  });

  it('gives every member an age band', () => {
    const bands = membersByBand(rollUpHousehold('HH-1', loaded())!);
    expect([...bands.keys()].sort()).toEqual(['adult', 'youth']);
  });

  it('answers nothing for a household nobody is on', () => {
    expect(rollUpHousehold('HH-9', loaded())).toBeUndefined();
  });

  it('gives a household that never skied zeroes and no anchor', () => {
    const context = loaded();
    for (const ride of context.rides.rides.all()) context.rides.rides.delete(ride.id);
    const roll = rollUpHousehold('HH-1', context);
    expect(roll?.rides).toBe(0);
    expect(roll?.anchor).toBeUndefined();
  });
});

describe('every household', () => {
  it('ranks them by what they spent', () => {
    const rolls = allHouseholds(loaded());
    expect(rolls.map((roll) => roll.householdId)).toEqual(['HH-1', 'HH-2']);
    expect(rolls[0]!.spend).toBeGreaterThanOrEqual(rolls[1]!.spend);
  });

  it('leaves guests with no household out', () => {
    expect(allHouseholds(loaded()).some((roll) => roll.householdId === '')).toBe(false);
  });
});

describe('lopsided households', () => {
  it('finds one where a single member does all the skiing', () => {
    const context = loaded();
    for (const ride of context.rides.ridesOfGuest('G-78')) context.rides.rides.delete(ride.id);
    for (const ride of context.rides.ridesOfGuest('G-79')) context.rides.rides.delete(ride.id);
    expect(lopsidedHouseholds(context).map((roll) => roll.householdId)).toEqual(['HH-1']);
  });

  it('leaves a household that skis together alone', () => {
    expect(lopsidedHouseholds(loaded()).map((roll) => roll.householdId)).toEqual([]);
  });

  it('says nothing about a household with one member', () => {
    expect(lopsidedHouseholds(loaded()).some((roll) => roll.householdId === 'HH-2')).toBe(false);
  });
});
