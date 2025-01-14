import { parseLiftCode, type LiftCode } from '../../util/ids.js';
import { err, ok, type Result } from '../../util/result.js';
import { SheaveholdError } from '../../util/diagnostic.js';

/**
 * The lifts, as the lift maintenance department describes them. Everything
 * downstream that says "vertical" or "capacity" reads its numbers from here, so
 * a wrong rise is a wrong season report, not a cosmetic problem.
 */

export type LiftKind = 'chair' | 'gondola' | 'surface' | 'tram' | 'carpet';

export type LiftStatus = 'in_service' | 'seasonal' | 'retired';

export interface Lift {
  readonly code: LiftCode;
  /** What it says on the trail map. */
  readonly name: string;
  readonly kind: LiftKind;
  readonly baseElevationFt: number;
  readonly topElevationFt: number;
  /** Along the line, not the horizontal run. */
  readonly slopeLengthFt: number;
  /** Elevation of the mid station, when the lift has one people get off at. */
  readonly midStationFt: number | undefined;
  /** People per carrier at the design load. A chair seats four. */
  readonly carrierCapacity: number;
  /** Carriers arriving at the loading point per hour at design speed. */
  readonly carriersPerHour: number;
  /** Base to top at design speed, in minutes. */
  readonly rideMinutes: number;
  /** Counts toward the beginner progression report. */
  readonly beginner: boolean;
  readonly status: LiftStatus;
  /** Season the lift first turned, as the starting calendar year. */
  readonly openedSeason: number;
}

const KINDS: readonly LiftKind[] = ['chair', 'gondola', 'surface', 'tram', 'carpet'];
const STATUSES: readonly LiftStatus[] = ['in_service', 'seasonal', 'retired'];

export function isLiftKind(value: string): value is LiftKind {
  return (KINDS as readonly string[]).includes(value);
}

export function isLiftStatus(value: string): value is LiftStatus {
  return (STATUSES as readonly string[]).includes(value);
}

/** The number every vertical calculation multiplies by. */
export function verticalRiseFt(lift: Lift): number {
  return lift.topElevationFt - lift.baseElevationFt;
}

/** Rise as far as the mid station, for a guest who did not ride to the top. */
export function midStationRiseFt(lift: Lift): number | undefined {
  if (lift.midStationFt === undefined) return undefined;
  return lift.midStationFt - lift.baseElevationFt;
}

export function hasMidStation(lift: Lift): boolean {
  return lift.midStationFt !== undefined;
}

/**
 * Design capacity in people per hour, which is the denominator of every
 * utilisation figure. It is carriers per hour times the seats on a carrier, and
 * it is deliberately not adjusted for the fact that nobody rides a quad four up.
 */
export function designCapacityPerHour(lift: Lift): number {
  return lift.carriersPerHour * lift.carrierCapacity;
}

/** Feet of rise a full hour at design capacity would produce. */
export function verticalCapacityPerHour(lift: Lift): number {
  return designCapacityPerHour(lift) * verticalRiseFt(lift);
}

/** The average grade along the line, as a percentage. Reported on the sheet. */
export function averageGradePercent(lift: Lift): number {
  const rise = verticalRiseFt(lift);
  const run = Math.sqrt(Math.max(0, lift.slopeLengthFt ** 2 - rise ** 2));
  if (run === 0) return 0;
  return Math.round((rise / run) * 1000) / 10;
}

export function ridesTurnableIn(lift: Lift, minutes: number): number {
  if (minutes <= 0) return 0;
  return Math.floor((designCapacityPerHour(lift) * minutes) / 60);
}

export interface LiftInput {
  readonly code: string;
  readonly name: string;
  readonly kind: string;
  readonly baseElevationFt: number;
  readonly topElevationFt: number;
  readonly slopeLengthFt: number;
  readonly midStationFt?: number | undefined;
  readonly carrierCapacity: number;
  readonly carriersPerHour: number;
  readonly rideMinutes: number;
  readonly beginner: boolean;
  readonly status: string;
  readonly openedSeason: number;
}

function positive(name: string, value: number): string | undefined {
  if (!Number.isFinite(value)) return `${name} is not a number`;
  if (value <= 0) return `${name} must be above zero, got ${value}`;
  return undefined;
}

export function makeLift(input: LiftInput): Result<Lift> {
  const code = parseLiftCode(input.code);
  if (!code.ok) return code;
  if (input.name.trim() === '') return err(`lift ${input.code} has no name`);
  if (!isLiftKind(input.kind)) return err(`lift ${input.code} has kind ${input.kind}`);
  if (!isLiftStatus(input.status)) return err(`lift ${input.code} has status ${input.status}`);

  const problems = [
    positive('slopeLengthFt', input.slopeLengthFt),
    positive('carrierCapacity', input.carrierCapacity),
    positive('carriersPerHour', input.carriersPerHour),
    positive('rideMinutes', input.rideMinutes),
  ].filter((problem): problem is string => problem !== undefined);
  if (problems.length > 0) return err(`lift ${input.code}: ${problems.join('; ')}`);

  if (input.topElevationFt <= input.baseElevationFt) {
    return err(`lift ${input.code} tops out at or below its base`);
  }
  const rise = input.topElevationFt - input.baseElevationFt;
  if (rise > input.slopeLengthFt) {
    return err(`lift ${input.code} rises ${rise} over a line of ${input.slopeLengthFt}`);
  }
  if (!Number.isInteger(input.carrierCapacity)) {
    return err(`lift ${input.code} seats a fraction of a person`);
  }
  if (input.midStationFt !== undefined) {
    if (input.midStationFt <= input.baseElevationFt || input.midStationFt >= input.topElevationFt) {
      return err(`lift ${input.code} has a mid station outside the line`);
    }
    if (input.kind !== 'gondola' && input.kind !== 'tram') {
      return err(`lift ${input.code} is a ${input.kind} and cannot have a mid station`);
    }
  }

  return ok({
    code: code.value,
    name: input.name.trim(),
    kind: input.kind,
    baseElevationFt: input.baseElevationFt,
    topElevationFt: input.topElevationFt,
    slopeLengthFt: input.slopeLengthFt,
    midStationFt: input.midStationFt,
    carrierCapacity: input.carrierCapacity,
    carriersPerHour: input.carriersPerHour,
    rideMinutes: input.rideMinutes,
    beginner: input.beginner,
    status: input.status,
    openedSeason: input.openedSeason,
  });
}

/**
 * Held by code. Order is by descending rise, because that is the order the
 * mountain manager reads a report in and nobody wants it alphabetical.
 */
export class LiftRegistry {
  private readonly byCode = new Map<string, Lift>();

  static from(lifts: readonly Lift[]): LiftRegistry {
    const registry = new LiftRegistry();
    for (const lift of lifts) registry.add(lift);
    return registry;
  }

  add(lift: Lift): void {
    if (this.byCode.has(lift.code)) {
      throw new SheaveholdError('lift.duplicate', `lift ${lift.code} is already registered`, {
        lift: lift.code,
      });
    }
    this.byCode.set(lift.code, lift);
  }

  find(code: LiftCode): Lift | undefined {
    return this.byCode.get(code);
  }

  get(code: LiftCode): Lift {
    const lift = this.byCode.get(code);
    if (lift === undefined) {
      throw new SheaveholdError('lift.unknown', `no lift ${code}`, { lift: code });
    }
    return lift;
  }

  has(code: LiftCode): boolean {
    return this.byCode.has(code);
  }

  get size(): number {
    return this.byCode.size;
  }

  all(): Lift[] {
    return [...this.byCode.values()].sort(
      (a, b) => verticalRiseFt(b) - verticalRiseFt(a) || a.code.localeCompare(b.code),
    );
  }

  inService(): Lift[] {
    return this.all().filter((lift) => lift.status === 'in_service');
  }

  beginnerLifts(): Lift[] {
    return this.all().filter((lift) => lift.beginner && lift.status !== 'retired');
  }

  totalVerticalCapacityPerHour(): number {
    return this.inService().reduce((total, lift) => total + verticalCapacityPerHour(lift), 0);
  }
}
