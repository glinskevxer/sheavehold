import {
  GuestDirectory,
  makeGuest,
  makeHousehold,
  type Guest,
  type GuestInput,
  type Household,
} from '../../src/domain/guest/guest.js';
import { expect as expectOk } from '../../src/util/result.js';
import { day } from './season.js';

export function guestOf(overrides: Partial<GuestInput> & { id: string }): Guest {
  return expectOk(makeGuest({ familyName: 'Ardley', givenName: 'Row', ...overrides }), 'guest');
}

export const HOUSEHOLD_ARDLEY: Household = expectOk(
  makeHousehold('HH-1', 'Ardley', 'G-77'),
  'household',
);

export const HOUSEHOLD_VANCE: Household = expectOk(makeHousehold('HH-2', '', 'G-91'), 'household');

export const GUESTS: readonly Guest[] = [
  guestOf({
    id: 'G-77',
    bornOn: day('1986-03-14'),
    householdId: 'HH-1',
    postcode: '81657',
    marketingOptIn: true,
    firstSeasonSeen: 2011,
  }),
  guestOf({
    id: 'G-78',
    givenName: 'Tess',
    bornOn: day('2016-08-02'),
    householdId: 'HH-1',
    postcode: '81657',
  }),
  guestOf({
    id: 'G-79',
    givenName: 'Milo',
    bornOn: day('2012-01-30'),
    householdId: 'HH-1',
    postcode: '81657',
  }),
  guestOf({
    id: 'G-91',
    familyName: 'Vance',
    givenName: 'Ida',
    bornOn: day('1949-11-05'),
    householdId: 'HH-2',
    postcode: '80202',
  }),
  guestOf({
    id: 'G-92',
    familyName: 'Okonkwo',
    givenName: 'Ben',
    bornOn: day('1993-06-21'),
    postcode: '80301',
  }),
  guestOf({ id: 'G-93', familyName: 'Reyes', givenName: 'Cam' }),
];

export function directory(): GuestDirectory {
  return GuestDirectory.from(GUESTS, [HOUSEHOLD_ARDLEY, HOUSEHOLD_VANCE]);
}
