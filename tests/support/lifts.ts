import { makeLift, type Lift, type LiftInput } from '../../src/domain/lift/lift.js';
import { expect as expectOk } from '../../src/util/result.js';

/**
 * The area as it stands. Seven lifts, one of them retired, numbers taken from
 * the same sheet the maintenance department keeps on the wall.
 */
const DEFAULTS: LiftInput = {
  code: 'SUNB',
  name: 'Sunburst',
  kind: 'chair',
  baseElevationFt: 8_140,
  topElevationFt: 9_380,
  slopeLengthFt: 4_260,
  carrierCapacity: 4,
  carriersPerHour: 600,
  rideMinutes: 7.5,
  beginner: false,
  status: 'in_service',
  openedSeason: 1998,
};

export function liftOf(overrides: Partial<LiftInput> = {}): Lift {
  return expectOk(makeLift({ ...DEFAULTS, ...overrides }), 'lift');
}

export const SUNBURST = liftOf();

export const RIDGELINE = liftOf({
  code: 'RIDGE',
  name: 'Ridgeline Express',
  kind: 'gondola',
  baseElevationFt: 8_140,
  topElevationFt: 10_020,
  slopeLengthFt: 7_940,
  midStationFt: 9_200,
  carrierCapacity: 8,
  carriersPerHour: 260,
  rideMinutes: 11,
  openedSeason: 2014,
});

export const BOWL = liftOf({
  code: 'BOWL',
  name: 'North Bowl',
  kind: 'chair',
  baseElevationFt: 9_120,
  topElevationFt: 10_460,
  slopeLengthFt: 4_980,
  carrierCapacity: 2,
  carriersPerHour: 450,
  rideMinutes: 9.5,
  openedSeason: 1976,
});

export const MEADOW = liftOf({
  code: 'MEADW',
  name: 'Meadow Double',
  kind: 'chair',
  baseElevationFt: 8_140,
  topElevationFt: 8_520,
  slopeLengthFt: 1_720,
  carrierCapacity: 2,
  carriersPerHour: 500,
  rideMinutes: 4,
  beginner: true,
  openedSeason: 1981,
});

export const CARPET = liftOf({
  code: 'CRPT',
  name: 'Learning Carpet',
  kind: 'carpet',
  baseElevationFt: 8_140,
  topElevationFt: 8_192,
  slopeLengthFt: 340,
  carrierCapacity: 1,
  carriersPerHour: 1_400,
  rideMinutes: 1.5,
  beginner: true,
  openedSeason: 2009,
});

export const POMA = liftOf({
  code: 'POMA',
  name: 'Cirque Poma',
  kind: 'surface',
  baseElevationFt: 10_020,
  topElevationFt: 10_610,
  slopeLengthFt: 2_180,
  carrierCapacity: 1,
  carriersPerHour: 720,
  rideMinutes: 5,
  status: 'seasonal',
  openedSeason: 1969,
});

export const OLDDBL = liftOf({
  code: 'OLDDB',
  name: 'Larkspur Double',
  kind: 'chair',
  baseElevationFt: 8_140,
  topElevationFt: 8_960,
  slopeLengthFt: 3_100,
  carrierCapacity: 2,
  carriersPerHour: 380,
  rideMinutes: 8,
  status: 'retired',
  openedSeason: 1965,
});

export const ALL_LIFTS: readonly Lift[] = [SUNBURST, RIDGELINE, BOWL, MEADOW, CARPET, POMA, OLDDBL];
