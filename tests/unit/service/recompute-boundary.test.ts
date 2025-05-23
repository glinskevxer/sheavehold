import { describe, expect, it } from 'vitest';
import { recomputeDate, recomputeDates } from '../../../src/service/recompute.js';
import { harness } from '../../support/service.js';
import { day } from '../../support/season.js';

describe('the rollover grace inside a recompute', () => {
  function dawnPatrol() {
    const system = harness();
    system.ingest([
      { at: '2025-01-14T10:40:00Z', seq: 1 },
      { at: '2025-01-14T11:15:00Z', seq: 2 },
    ]);
    return system;
  }

  it('leaves the late ride off the new day', () => {
    const system = dawnPatrol();
    recomputeDate(day('2025-01-13'), system);
    const fourteenth = recomputeDate(day('2025-01-14'), system);
    expect(fourteenth.rides).toEqual([]);
    expect(fourteenth.boundaryMoves).toHaveLength(1);
    expect(fourteenth.diagnostics.has('recompute.boundary_moved')).toBe(true);
  });

  it('leaves an ordinary morning alone', () => {
    const system = harness();
    system.ingest([
      { at: '2025-01-13T17:00:00Z', seq: 1 },
      { at: '2025-01-13T18:00:00Z', seq: 2 },
    ]);
    const result = recomputeDate(day('2025-01-13'), system);
    expect(result.boundaryMoves).toEqual([]);
    expect(result.rides).toHaveLength(2);
  });

  it('takes a wider grace when the area asks for one', () => {
    const system = harness();
    system.ingest([
      { at: '2025-01-14T10:40:00Z', seq: 1 },
      { at: '2025-01-14T11:50:00Z', seq: 2 },
    ]);
    recomputeDate(day('2025-01-13'), system);
    expect(recomputeDate(day('2025-01-14'), system).rides).toHaveLength(1);
    const wide = { ...system, boundaryGraceMinutes: 120 };
    recomputeDate(day('2025-01-13'), wide);
    expect(recomputeDate(day('2025-01-14'), wide).rides).toEqual([]);
  });

  it('counts one skier visit rather than two across the rollover', () => {
    const system = dawnPatrol();
    recomputeDates([day('2025-01-13'), day('2025-01-14')], system);
    expect(system.rides.skierVisitsOn(day('2025-01-13'))).toBe(1);
    expect(system.rides.skierVisitsOn(day('2025-01-14'))).toBe(0);
  });
});

describe('the mid station inference inside a recompute', () => {
  function quickLaps() {
    const system = harness();
    system.ingest(
      [
        { at: '2025-01-13T17:00:00Z', seq: 1, terminal: 'RIDGE.01' },
        { at: '2025-01-13T17:12:00Z', seq: 2, terminal: 'RIDGE.01' },
      ],
      { terminal: 'RIDGE.01' },
    );
    return system;
  }

  it('credits the lower half of the gondola on a lap nobody could ski', () => {
    const result = recomputeDate(day('2025-01-13'), quickLaps());
    expect(result.midStationAdjustments).toHaveLength(1);
    expect(result.rides[0]?.verticalFt).toBe(1060);
    expect(result.rides[1]?.verticalFt).toBe(1880);
    expect(result.diagnostics.has('recompute.mid_station')).toBe(true);
  });

  it('leaves the full rise when the inference is turned off', () => {
    const system = { ...quickLaps(), inferMidStation: false };
    const result = recomputeDate(day('2025-01-13'), system);
    expect(result.midStationAdjustments).toEqual([]);
    expect(result.rides[0]?.verticalFt).toBe(1880);
  });

  it('leaves a chair alone however fast the laps', () => {
    const system = harness();
    system.ingest([
      { at: '2025-01-13T17:00:00Z', seq: 1 },
      { at: '2025-01-13T17:20:00Z', seq: 2 },
    ]);
    expect(recomputeDate(day('2025-01-13'), system).midStationAdjustments).toEqual([]);
  });

  it('writes the adjusted vertical into the store', () => {
    const system = quickLaps();
    recomputeDate(day('2025-01-13'), system);
    expect(system.rides.verticalOn(day('2025-01-13'))).toBe(1060 + 1880);
  });
});
