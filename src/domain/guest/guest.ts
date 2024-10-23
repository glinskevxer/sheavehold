import { operatingDateParts, type OperatingDate } from '../../util/clock.js';
import { err, ok, type Result } from '../../util/result.js';
import { SheaveholdError } from '../../util/diagnostic.js';
import type { AgeBand } from '../product/product.js';

/**
 * People, and the households they buy passes in. The household matters more
 * than it looks: a family buys five passes on one card, and when the finance
 * office asks what a household is worth over a season it wants one number, not
 * five. It also drives the sharing rules, because a pass-back between two
 * members of the same household is a different conversation from a pass-back
 * between strangers.
 */

export interface Guest {
  readonly id: string;
  readonly familyName: string;
  readonly givenName: string;
  /** Birth date in the area's own zone. Used for the age band only. */
  readonly bornOn: OperatingDate | undefined;
  readonly householdId: string | undefined;
  readonly postcode: string;
  readonly marketingOptIn: boolean;
  /** Season this person first showed up, as the starting calendar year. */
  readonly firstSeasonSeen: number | undefined;
}

export interface GuestInput {
  readonly id: string;
  readonly familyName: string;
  readonly givenName: string;
  readonly bornOn?: OperatingDate | undefined;
  readonly householdId?: string | undefined;
  readonly postcode?: string | undefined;
  readonly marketingOptIn?: boolean | undefined;
  readonly firstSeasonSeen?: number | undefined;
}

export function makeGuest(input: GuestInput): Result<Guest> {
  if (input.id.trim() === '') return err('a guest needs an id');
  if (input.familyName.trim() === '') return err(`guest ${input.id} has no family name`);
  if (input.givenName.trim() === '') return err(`guest ${input.id} has no given name`);
  if (input.firstSeasonSeen !== undefined && !Number.isInteger(input.firstSeasonSeen)) {
    return err(`guest ${input.id} first came in ${input.firstSeasonSeen}`);
  }
  return ok({
    id: input.id.trim(),
    familyName: input.familyName.trim(),
    givenName: input.givenName.trim(),
    bornOn: input.bornOn,
    householdId: input.householdId?.trim() === '' ? undefined : input.householdId,
    postcode: input.postcode?.trim().toUpperCase() ?? '',
    marketingOptIn: input.marketingOptIn ?? false,
    firstSeasonSeen: input.firstSeasonSeen,
  });
}

export function displayName(guest: Guest): string {
  return `${guest.familyName}, ${guest.givenName}`;
}

/** Completed years on the given operating date. */
export function ageOn(guest: Guest, date: OperatingDate): number | undefined {
  if (guest.bornOn === undefined) return undefined;
  const born = operatingDateParts(guest.bornOn);
  const on = operatingDateParts(date);
  let age = on.year - born.year;
  if (on.month < born.month || (on.month === born.month && on.day < born.day)) age -= 1;
  return age;
}

/**
 * The bands the ticket office sells against. They are inclusive at the bottom
 * and the boundaries are the ones printed on the rate card, so a guest who
 * turns thirteen mid season moves out of youth on their birthday and not at
 * the start of the season.
 */
export function ageBandOn(guest: Guest, date: OperatingDate): AgeBand | undefined {
  const age = ageOn(guest, date);
  if (age === undefined) return undefined;
  if (age < 7) return 'child';
  if (age < 13) return 'youth';
  if (age < 65) return 'adult';
  if (age < 80) return 'senior';
  return 'super_senior';
}

export interface Household {
  readonly id: string;
  readonly label: string;
  readonly primaryGuestId: string;
}

export function makeHousehold(
  id: string,
  label: string,
  primaryGuestId: string,
): Result<Household> {
  if (id.trim() === '') return err('a household needs an id');
  if (primaryGuestId.trim() === '') return err(`household ${id} has no primary member`);
  return ok({
    id: id.trim(),
    label: label.trim() === '' ? id.trim() : label.trim(),
    primaryGuestId: primaryGuestId.trim(),
  });
}

export class GuestDirectory {
  private readonly guests = new Map<string, Guest>();
  private readonly households = new Map<string, Household>();

  static from(guests: readonly Guest[], households: readonly Household[] = []): GuestDirectory {
    const directory = new GuestDirectory();
    for (const household of households) directory.addHousehold(household);
    for (const guest of guests) directory.add(guest);
    return directory;
  }

  add(guest: Guest): void {
    if (this.guests.has(guest.id)) {
      throw new SheaveholdError('guest.duplicate', `guest ${guest.id} is on file twice`, {
        guest: guest.id,
      });
    }
    this.guests.set(guest.id, guest);
  }

  addHousehold(household: Household): void {
    if (this.households.has(household.id)) {
      throw new SheaveholdError(
        'household.duplicate',
        `household ${household.id} is listed twice`,
        {
          household: household.id,
        },
      );
    }
    this.households.set(household.id, household);
  }

  find(id: string): Guest | undefined {
    return this.guests.get(id);
  }

  get(id: string): Guest {
    const guest = this.guests.get(id);
    if (guest === undefined) {
      throw new SheaveholdError('guest.unknown', `no guest ${id}`, { guest: id });
    }
    return guest;
  }

  household(id: string): Household | undefined {
    return this.households.get(id);
  }

  householdOf(guestId: string): Household | undefined {
    const guest = this.guests.get(guestId);
    if (guest?.householdId === undefined) return undefined;
    return this.households.get(guest.householdId);
  }

  membersOf(householdId: string): Guest[] {
    return [...this.guests.values()]
      .filter((guest) => guest.householdId === householdId)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /** True when two people are on the same account, which softens a pass-back. */
  sameHousehold(left: string, right: string): boolean {
    const a = this.guests.get(left)?.householdId;
    const b = this.guests.get(right)?.householdId;
    return a !== undefined && a === b;
  }

  all(): Guest[] {
    return [...this.guests.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  get size(): number {
    return this.guests.size;
  }

  /** Households with a member whose primary record is missing, which is a data fault. */
  orphanedHouseholds(): string[] {
    const problems: string[] = [];
    for (const household of this.households.values()) {
      if (!this.guests.has(household.primaryGuestId)) {
        problems.push(
          `household ${household.id} points at missing guest ${household.primaryGuestId}`,
        );
      }
    }
    for (const guest of this.guests.values()) {
      if (guest.householdId !== undefined && !this.households.has(guest.householdId)) {
        problems.push(`guest ${guest.id} belongs to missing household ${guest.householdId}`);
      }
    }
    return problems.sort();
  }
}
