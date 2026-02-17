import type { OperatingDate } from '../util/clock.js';
import { distinctSorted, groupBy, sumBy } from '../util/collect.js';
import { cents, formatMoney, type Cents } from '../util/money.js';
import { ageBandOn, type Guest } from '../domain/guest/guest.js';
import type { ReferenceStore } from '../storage/repository/reference.js';
import type { RideStore } from '../storage/repository/rides.js';
import { attributeSeason } from './revenue.js';

/**
 * A family buys five passes on one account and the finance office wants one
 * number for the household, not five. Marketing wants the opposite: which
 * member is the one who actually books the trip.
 *
 * Both come out of the same roll up, which is why it exists rather than each
 * side counting for itself. They disagreed by a factor of three when they did.
 */

export interface MemberRow {
  readonly guestId: string;
  readonly name: string;
  readonly ageBand: string | undefined;
  readonly daysSkied: number;
  readonly rides: number;
  readonly verticalFt: number;
  readonly spend: Cents;
}

export interface HouseholdRoll {
  readonly householdId: string;
  readonly label: string;
  readonly members: readonly MemberRow[];
  readonly daysSkiedTogether: number;
  readonly distinctDays: number;
  readonly rides: number;
  readonly verticalFt: number;
  readonly spend: Cents;
  readonly spendFormatted: string;
  /** The member who skied most days, which is usually the one who books. */
  readonly anchor: string | undefined;
}

export interface HouseholdContext {
  readonly reference: ReferenceStore;
  readonly rides: RideStore;
  readonly asOf: OperatingDate;
}

export function rollUpHousehold(
  householdId: string,
  context: HouseholdContext,
): HouseholdRoll | undefined {
  const household = context.reference.guests.by('household', householdId);
  if (household.length === 0) return undefined;

  const spendByGuest = new Map<string, number>();
  for (const line of attributeSeason(context).lines) {
    spendByGuest.set(line.guestId, (spendByGuest.get(line.guestId) ?? 0) + line.value);
  }

  const members: MemberRow[] = household
    .map((guest: Guest) => {
      const own = context.rides.ridesOfGuest(guest.id);
      return {
        guestId: guest.id,
        name: `${guest.familyName}, ${guest.givenName}`,
        ageBand: ageBandOn(guest, context.asOf),
        daysSkied: distinctSorted(own, (ride) => ride.operatingDate).length,
        rides: own.length,
        verticalFt: sumBy(own, (ride) => ride.verticalFt),
        spend: cents(spendByGuest.get(guest.id) ?? 0),
      };
    })
    .sort((a, b) => b.daysSkied - a.daysSkied || a.guestId.localeCompare(b.guestId));

  const dayCounts = new Map<string, Set<string>>();
  for (const guest of household) {
    for (const ride of context.rides.ridesOfGuest(guest.id)) {
      const own = dayCounts.get(ride.operatingDate) ?? new Set<string>();
      own.add(guest.id);
      dayCounts.set(ride.operatingDate, own);
    }
  }

  const together = [...dayCounts.values()].filter((own) => own.size > 1).length;
  const anchor = members[0]?.daysSkied === 0 ? undefined : members[0]?.guestId;
  const spend = cents(sumBy(members, (member) => member.spend));

  return {
    householdId,
    label: household[0]?.familyName ?? householdId,
    members,
    daysSkiedTogether: together,
    distinctDays: dayCounts.size,
    rides: sumBy(members, (member) => member.rides),
    verticalFt: sumBy(members, (member) => member.verticalFt),
    spend,
    spendFormatted: formatMoney(spend),
    anchor,
  };
}

export function allHouseholds(context: HouseholdContext): HouseholdRoll[] {
  const withHousehold = context.reference.guests
    .all()
    .filter((guest) => guest.householdId !== undefined);
  const ids = distinctSorted(withHousehold, (guest) => guest.householdId ?? '');
  return ids
    .map((id) => rollUpHousehold(id, context))
    .filter((roll): roll is HouseholdRoll => roll !== undefined)
    .sort((a, b) => b.spend - a.spend || a.householdId.localeCompare(b.householdId));
}

/** Households where one member does all the skiing, which renew differently. */
export function lopsidedHouseholds(context: HouseholdContext, share = 0.8): HouseholdRoll[] {
  return allHouseholds(context).filter((roll) => {
    if (roll.rides === 0) return false;
    if (roll.members.length < 2) return false;
    return (roll.members[0]?.rides ?? 0) / roll.rides >= share;
  });
}

export function membersByBand(roll: HouseholdRoll): Map<string, MemberRow[]> {
  return groupBy(roll.members, (member) => member.ageBand ?? 'unknown');
}
