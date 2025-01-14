import { describe, expect, it } from 'vitest';
import {
  adjustedRideIds,
  applyMidStationUnloads,
  DEFAULT_DESCENT_FACTOR,
  verticalReclaimedFt,
} from '../../../../src/domain/vertical/midstation.js';
import { hasMidStation, makeLift, midStationRiseFt } from '../../../../src/domain/lift/lift.js';
import { totalVertical } from '../../../../src/domain/vertical/vertical.js';
import { isErr } from '../../../../src/util/result.js';
import { RIDGELINE, SUNBURST } from '../../../support/lifts.js';
import { lifts, ridesFrom, type ScanSpec } from '../../../support/pipeline.js';

function at(minutes: number, overrides: Partial<ScanSpec> = {}): ScanSpec {
  const base = new Date('2025-01-13T16:00:00Z').getTime();
  return {
    at: new Date(base + minutes * 60_000).toISOString(),
    terminal: 'RIDGE.01',
    ...overrides,
  };
}

describe('the lift record', () => {
  it('knows which lifts have a mid station', () => {
    expect(hasMidStation(RIDGELINE)).toBe(true);
    expect(hasMidStation(SUNBURST)).toBe(false);
    expect(midStationRiseFt(RIDGELINE)).toBe(1060);
    expect(midStationRiseFt(SUNBURST)).toBeUndefined();
  });

  it('refuses a mid station outside the line', () => {
    expect(isErr(makeLift({ ...RIDGELINE, midStationFt: 7_000 }))).toBe(true);
    expect(isErr(makeLift({ ...RIDGELINE, midStationFt: 11_000 }))).toBe(true);
  });

  it('refuses a mid station on a chair', () => {
    expect(isErr(makeLift({ ...SUNBURST, midStationFt: 8_800 }))).toBe(true);
  });
});

describe('inferring a mid station unload', () => {
  it('credits the lower half when the guest is back too fast', () => {
    const rides = ridesFrom([at(0), at(12)]);
    const result = applyMidStationUnloads(rides, { lifts: lifts() });
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0]).toMatchObject({ fullRiseFt: 1880, creditedFt: 1060 });
    expect(result.rides[0]?.verticalFt).toBe(1060);
    expect(result.rides[1]?.verticalFt).toBe(1880);
  });

  it('leaves a full lap alone', () => {
    const result = applyMidStationUnloads(ridesFrom([at(0), at(30)]), { lifts: lifts() });
    expect(result.adjustments).toEqual([]);
    expect(totalVertical(result.rides)).toBe(3760);
  });

  it('leaves the last ride of the day alone, since nothing follows it', () => {
    const result = applyMidStationUnloads(ridesFrom([at(0)]), { lifts: lifts() });
    expect(result.adjustments).toEqual([]);
  });

  it('ignores a change of lift', () => {
    const rides = ridesFrom([at(0), at(5, { terminal: 'SUNB.01' })]);
    expect(applyMidStationUnloads(rides, { lifts: lifts() }).adjustments).toEqual([]);
  });

  it('ignores a lift with no mid station however fast the lap', () => {
    const rides = ridesFrom([at(0, { terminal: 'SUNB.01' }), at(9, { terminal: 'SUNB.01' })]);
    expect(applyMidStationUnloads(rides, { lifts: lifts() }).adjustments).toEqual([]);
  });

  it('takes a different descent factor', () => {
    const rides = ridesFrom([at(0), at(20)]);
    expect(applyMidStationUnloads(rides, { lifts: lifts() }).adjustments).toEqual([]);
    const generous = applyMidStationUnloads(rides, { lifts: lifts(), descentFactor: 1 });
    expect(generous.adjustments).toHaveLength(1);
    expect(DEFAULT_DESCENT_FACTOR).toBe(0.5);
  });

  it('adjusts a run of quick laps except the last', () => {
    const result = applyMidStationUnloads(ridesFrom([at(0), at(12), at(24)]), { lifts: lifts() });
    expect(adjustedRideIds(result)).toHaveLength(2);
    expect(result.rides[2]?.verticalFt).toBe(1880);
  });

  it('says how much vertical it took back', () => {
    const result = applyMidStationUnloads(ridesFrom([at(0), at(12)]), { lifts: lifts() });
    expect(verticalReclaimedFt(result)).toBe(820);
    expect(verticalReclaimedFt({ rides: [], adjustments: [] })).toBe(0);
  });

  it('keeps the rides in time order', () => {
    const result = applyMidStationUnloads(ridesFrom([at(24), at(0), at(12)]), { lifts: lifts() });
    const times = result.rides.map((ride) => ride.boardedAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
