import { describe, expect, it } from 'vitest';
import {
  ageBandOn,
  ageOn,
  displayName,
  GuestDirectory,
  makeGuest,
  makeHousehold,
} from '../../../../src/domain/guest/guest.js';
import { expect as expectOk, isErr } from '../../../../src/util/result.js';
import { directory, guestOf, GUESTS, HOUSEHOLD_ARDLEY } from '../../../support/guests.js';
import { day } from '../../../support/season.js';

describe('a guest', () => {
  it('trims the names and folds the postcode', () => {
    const guest = guestOf({ id: ' G-1 ', familyName: ' Ardley ', postcode: ' 81657 ' });
    expect(guest.id).toBe('G-1');
    expect(guest.familyName).toBe('Ardley');
    expect(guest.postcode).toBe('81657');
    expect(displayName(guest)).toBe('Ardley, Row');
  });

  it('treats an empty household as no household', () => {
    expect(guestOf({ id: 'G-1', householdId: '  ' }).householdId).toBeUndefined();
  });

  it('defaults marketing off', () => {
    expect(guestOf({ id: 'G-1' }).marketingOptIn).toBe(false);
  });

  it('refuses a guest with no id or no name', () => {
    expect(isErr(makeGuest({ id: ' ', familyName: 'a', givenName: 'b' }))).toBe(true);
    expect(isErr(makeGuest({ id: 'G-1', familyName: ' ', givenName: 'b' }))).toBe(true);
    expect(isErr(makeGuest({ id: 'G-1', familyName: 'a', givenName: ' ' }))).toBe(true);
    expect(
      isErr(makeGuest({ id: 'G-1', familyName: 'a', givenName: 'b', firstSeasonSeen: 2011.5 })),
    ).toBe(true);
  });
});

describe('ages', () => {
  const born = guestOf({ id: 'G-1', bornOn: day('2012-01-30') });

  it('counts completed years', () => {
    expect(ageOn(born, day('2025-01-29'))).toBe(12);
    expect(ageOn(born, day('2025-01-30'))).toBe(13);
    expect(ageOn(born, day('2025-12-31'))).toBe(13);
  });

  it('answers nothing when nobody wrote a birth date down', () => {
    expect(ageOn(guestOf({ id: 'G-2' }), day('2025-01-30'))).toBeUndefined();
    expect(ageBandOn(guestOf({ id: 'G-2' }), day('2025-01-30'))).toBeUndefined();
  });

  it('moves a guest out of youth on the birthday itself', () => {
    expect(ageBandOn(born, day('2025-01-29'))).toBe('youth');
    expect(ageBandOn(born, day('2025-01-30'))).toBe('adult');
  });

  it('places every band', () => {
    expect(ageBandOn(guestOf({ id: 'a', bornOn: day('2020-01-01') }), day('2025-01-13'))).toBe(
      'child',
    );
    expect(ageBandOn(guestOf({ id: 'b', bornOn: day('2016-01-01') }), day('2025-01-13'))).toBe(
      'youth',
    );
    expect(ageBandOn(guestOf({ id: 'c', bornOn: day('1986-03-14') }), day('2025-01-13'))).toBe(
      'adult',
    );
    expect(ageBandOn(guestOf({ id: 'd', bornOn: day('1949-11-05') }), day('2025-01-13'))).toBe(
      'senior',
    );
    expect(ageBandOn(guestOf({ id: 'e', bornOn: day('1940-11-05') }), day('2025-01-13'))).toBe(
      'super_senior',
    );
  });
});

describe('households', () => {
  it('falls back to the id when nobody named it', () => {
    expect(expectOk(makeHousehold('HH-2', '  ', 'G-91'), 'household').label).toBe('HH-2');
    expect(HOUSEHOLD_ARDLEY.label).toBe('Ardley');
  });

  it('refuses a household with no id or no primary member', () => {
    expect(isErr(makeHousehold(' ', 'x', 'G-1'))).toBe(true);
    expect(isErr(makeHousehold('HH-1', 'x', ' '))).toBe(true);
  });
});

describe('the directory', () => {
  const people = directory();

  it('finds a guest and complains about one it has never seen', () => {
    expect(people.size).toBe(6);
    expect(people.get('G-91').familyName).toBe('Vance');
    expect(people.find('G-000')).toBeUndefined();
    expect(() => people.get('G-000')).toThrow('no guest G-000');
  });

  it('refuses the same guest or household twice', () => {
    expect(() => people.add(GUESTS[0]!)).toThrow('on file twice');
    expect(() => people.addHousehold(HOUSEHOLD_ARDLEY)).toThrow('listed twice');
  });

  it('walks from a guest to their household and back to the members', () => {
    expect(people.householdOf('G-78')?.label).toBe('Ardley');
    expect(people.householdOf('G-92')).toBeUndefined();
    expect(people.membersOf('HH-1').map((guest) => guest.id)).toEqual(['G-77', 'G-78', 'G-79']);
    expect(people.membersOf('HH-9')).toEqual([]);
  });

  it('knows when two people share an account', () => {
    expect(people.sameHousehold('G-77', 'G-79')).toBe(true);
    expect(people.sameHousehold('G-77', 'G-91')).toBe(false);
    expect(people.sameHousehold('G-92', 'G-93')).toBe(false);
    expect(people.sameHousehold('G-77', 'G-000')).toBe(false);
  });

  it('lists everybody in id order', () => {
    expect(people.all().map((guest) => guest.id)).toEqual([
      'G-77',
      'G-78',
      'G-79',
      'G-91',
      'G-92',
      'G-93',
    ]);
  });

  it('finds a household nobody belongs to and a guest pointing nowhere', () => {
    expect(people.orphanedHouseholds()).toEqual([]);
    const broken = GuestDirectory.from(
      [guestOf({ id: 'G-1', householdId: 'HH-GONE' })],
      [expectOk(makeHousehold('HH-3', 'x', 'G-MISSING'), 'household')],
    );
    expect(broken.orphanedHouseholds()).toEqual([
      'guest G-1 belongs to missing household HH-GONE',
      'household HH-3 points at missing guest G-MISSING',
    ]);
  });

  it('answers with the household record itself when asked directly', () => {
    expect(people.household('HH-2')?.primaryGuestId).toBe('G-91');
    expect(people.household('HH-9')).toBeUndefined();
  });
});
