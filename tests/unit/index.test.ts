import { describe, expect, it } from 'vitest';
import * as sheavehold from '../../src/index.js';

/**
 * The public surface is what an embedder writes against, so adding to it is
 * cheap and taking something away is a breaking change. This test is here to
 * make the second one deliberate.
 */

describe('the public surface', () => {
  it('exports the small helpers', () => {
    expect(typeof sheavehold.ok).toBe('function');
    expect(typeof sheavehold.parseOperatingDate).toBe('function');
    expect(typeof sheavehold.formatMoney).toBe('function');
    expect(typeof sheavehold.parseCsvTable).toBe('function');
    expect(typeof sheavehold.renderTable).toBe('function');
    expect(typeof sheavehold.groupBy).toBe('function');
    expect(typeof sheavehold.DiagnosticBag).toBe('function');
  });

  it('exports the domain a caller would build against', () => {
    expect(typeof sheavehold.makeLift).toBe('function');
    expect(typeof sheavehold.LiftRegistry).toBe('function');
    expect(typeof sheavehold.makeTerminal).toBe('function');
    expect(typeof sheavehold.buildRides).toBe('function');
    expect(typeof sheavehold.buildVisits).toBe('function');
    expect(typeof sheavehold.skierVisits).toBe('function');
  });

  it('exports the services and the reports', () => {
    expect(typeof sheavehold.ingestUpload).toBe('function');
    expect(typeof sheavehold.recomputeDate).toBe('function');
    expect(typeof sheavehold.replayDates).toBe('function');
    expect(typeof sheavehold.daySummary).toBe('function');
    expect(typeof sheavehold.buildDailyReport).toBe('function');
    expect(typeof sheavehold.renderDailyReport).toBe('function');
    expect(typeof sheavehold.buildRouter).toBe('function');
  });

  it('carries the version', () => {
    expect(sheavehold.VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('keeps the command line out of the library surface', () => {
    expect('runCli' in sheavehold).toBe(false);
    expect('emptyApp' in sheavehold).toBe(false);
  });

  it('works end to end through the surface alone', () => {
    const lift = sheavehold.makeLift({
      code: 'TEST',
      name: 'Test Lift',
      kind: 'chair',
      baseElevationFt: 8_000,
      topElevationFt: 9_000,
      slopeLengthFt: 4_000,
      carrierCapacity: 4,
      carriersPerHour: 600,
      rideMinutes: 7,
      beginner: false,
      status: 'in_service',
      openedSeason: 2020,
    });
    expect(lift.ok).toBe(true);
    if (!lift.ok) return;
    expect(sheavehold.verticalRiseFt(lift.value)).toBe(1_000);
    expect(sheavehold.LiftRegistry.from([lift.value]).size).toBe(1);
  });
});
