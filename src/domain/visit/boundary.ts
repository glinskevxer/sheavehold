import {
  addOperatingDays,
  minutesIntoOperatingDay,
  operatingDay,
  type OperatingDate,
} from '../../util/clock.js';
import { compareRides, type Ride } from '../ride/ride.js';

/**
 * The 04:00 rollover is right for almost every day and wrong for the two or
 * three a season when something runs late. A charity dawn patrol boards the
 * gondola at 03:40 and the same people ride it again at 04:15, and the plain
 * rule gives them two skier visits and burns two days off a three day ticket.
 *
 * So a ride shortly after the boundary is pulled back onto the previous
 * operating day, but only when that guest was already skiing before it. A guest
 * whose first ride of the season is at 04:15 gets the ordinary answer.
 *
 * This runs on rides, before visits are built, because moving a ride has to
 * move its day count with it.
 */

export const DEFAULT_GRACE_MINUTES = 45;

export interface BoundaryOptions {
  readonly graceMinutes?: number | undefined;
}

export interface BoundaryMove {
  readonly rideId: string;
  readonly guestId: string;
  readonly from: OperatingDate;
  readonly to: OperatingDate;
  readonly minutesAfterBoundary: number;
}

export interface BoundaryResult {
  readonly rides: readonly Ride[];
  readonly moves: readonly BoundaryMove[];
}

/** True when a ride boarded inside the grace window after the rollover. */
export function isJustAfterBoundary(ride: Ride, graceMinutes: number): boolean {
  const minutes = minutesIntoOperatingDay(ride.boardedAt);
  return minutes >= 0 && minutes < graceMinutes;
}

export function reassignBoundaryRides(
  rides: readonly Ride[],
  options: BoundaryOptions = {},
): BoundaryResult {
  const grace = options.graceMinutes ?? DEFAULT_GRACE_MINUTES;
  const skiedOn = new Set<string>();
  for (const ride of rides) {
    skiedOn.add(`${ride.guestId}#${ride.operatingDate}`);
  }

  const moves: BoundaryMove[] = [];
  const moved = rides.map((ride) => {
    if (!isJustAfterBoundary(ride, grace)) return ride;
    const previous = addOperatingDays(ride.operatingDate, -1);
    if (!skiedOn.has(`${ride.guestId}#${previous}`)) return ride;
    moves.push({
      rideId: ride.id,
      guestId: ride.guestId,
      from: ride.operatingDate,
      to: previous,
      minutesAfterBoundary: minutesIntoOperatingDay(ride.boardedAt),
    });
    return { ...ride, operatingDate: previous };
  });

  return { rides: [...moved].sort(compareRides), moves };
}

/** The day a ride would fall on with no grace applied, for the audit trail. */
export function plainOperatingDay(ride: Ride): OperatingDate {
  return operatingDay(ride.boardedAt);
}

export function movesOnDate(result: BoundaryResult, date: OperatingDate): BoundaryMove[] {
  return result.moves.filter((move) => move.to === date);
}

export function movedRideIds(result: BoundaryResult): string[] {
  return result.moves.map((move) => move.rideId).sort();
}
