import type { OperatingDate } from '../../util/clock.js';
import type { LiftCode, MediaSerial, TerminalId } from '../../util/ids.js';
import type { LiftRegistry } from '../lift/lift.js';
import { verticalRiseFt } from '../lift/lift.js';
import type { AuthorisationResult } from '../scan/authorise.js';

/**
 * A ride is one person going up one lift once. It is the first object in the
 * system that a non technical person recognises, and everything the mountain
 * reports is counted in these.
 *
 * A ride is created from an accepted, deduped, authorised scan and from nothing
 * else. In particular it is not created from what the gate itself decided,
 * because the gate runs a stale entitlement cache. When the two disagree the
 * ride follows our decision and the disagreement goes in the register.
 */

export interface Ride {
  readonly id: string;
  readonly mediaSerial: MediaSerial;
  readonly guestId: string;
  readonly entitlementId: string;
  readonly productCode: string;
  readonly lift: LiftCode;
  readonly terminalId: TerminalId;
  readonly boardedAt: Date;
  readonly operatingDate: OperatingDate;
  readonly verticalFt: number;
  /** Design ride time, which is an estimate and is labelled as one. */
  readonly rideMinutes: number;
  /** Boarding plus the design ride time. Where the guest probably is. */
  readonly unloadsAt: Date;
  readonly sequence: number;
  /** True when the gate would have turned this person away and we did not. */
  readonly overriddenGate: boolean;
}

export function rideId(date: OperatingDate, terminalId: TerminalId, sequence: number): string {
  return `R-${date}-${terminalId}-${String(sequence).padStart(6, '0')}`;
}

export interface BuildRideOptions {
  readonly lifts: LiftRegistry;
}

export function buildRide(
  result: AuthorisationResult,
  options: BuildRideOptions,
): Ride | undefined {
  if (!result.allowed) return undefined;
  if (result.admission.scan.outcome !== 'accept') return undefined;
  const { scan } = result.admission;
  const guestId = result.admission.guestId;
  const entitlementId = result.entitlementId;
  const productCode = result.productCode;
  if (guestId === undefined || entitlementId === undefined || productCode === undefined) {
    return undefined;
  }
  const lift = options.lifts.find(scan.lift);
  if (lift === undefined) return undefined;

  return {
    id: rideId(scan.operatingDate, scan.terminalId, scan.sequence),
    mediaSerial: scan.mediaSerial,
    guestId,
    entitlementId,
    productCode,
    lift: scan.lift,
    terminalId: scan.terminalId,
    boardedAt: scan.at,
    operatingDate: scan.operatingDate,
    verticalFt: verticalRiseFt(lift),
    rideMinutes: lift.rideMinutes,
    unloadsAt: new Date(scan.at.getTime() + lift.rideMinutes * 60_000),
    sequence: scan.sequence,
    overriddenGate: result.admission.disagreesWithGate,
  };
}

export function buildRides(
  results: readonly AuthorisationResult[],
  options: BuildRideOptions,
): Ride[] {
  const rides: Ride[] = [];
  for (const result of results) {
    const ride = buildRide(result, options);
    if (ride !== undefined) rides.push(ride);
  }
  return rides;
}

export function compareRides(left: Ride, right: Ride): number {
  return (
    left.boardedAt.getTime() - right.boardedAt.getTime() ||
    left.terminalId.localeCompare(right.terminalId) ||
    left.sequence - right.sequence
  );
}

export function ridesOn(rides: readonly Ride[], date: OperatingDate): Ride[] {
  return rides.filter((ride) => ride.operatingDate === date);
}

export function ridesOfGuest(rides: readonly Ride[], guestId: string): Ride[] {
  return rides.filter((ride) => ride.guestId === guestId).sort(compareRides);
}

export function ridesOnLift(rides: readonly Ride[], lift: LiftCode): Ride[] {
  return rides.filter((ride) => ride.lift === lift).sort(compareRides);
}

export function totalVerticalFt(rides: readonly Ride[]): number {
  return rides.reduce((total, ride) => total + ride.verticalFt, 0);
}

export function ridesByLift(rides: readonly Ride[]): Map<LiftCode, Ride[]> {
  const byLift = new Map<LiftCode, Ride[]>();
  for (const ride of rides) {
    byLift.set(ride.lift, [...(byLift.get(ride.lift) ?? []), ride]);
  }
  return byLift;
}
