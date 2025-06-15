import { describe, expect, it } from 'vitest';
import {
  busiestHour,
  hourLabel,
  hourOf,
  hourlyProfile,
  liftHourlyProfiles,
  ridesPerHourDelivered,
  uphillDelivered,
} from '../../../../src/domain/capacity/capacity.js';
import { CARD_TESS } from '../../../support/media.js';
import { ridesFrom, type ScanSpec } from '../../../support/pipeline.js';
import { day } from '../../../support/season.js';

function at(minutes: number, overrides: Partial<ScanSpec> = {}): ScanSpec {
  const base = new Date('2025-01-13T16:00:00Z').getTime();
  return { at: new Date(base + minutes * 60_000).toISOString(), ...overrides };
}

describe('hours from the rollover', () => {
  it('puts nine in the morning in hour five', () => {
    const [ride] = ridesFrom([at(0)]);
    expect(hourOf(ride!)).toBe(5);
    expect(hourLabel(5)).toBe('09:00');
  });

  it('labels the late hours of a night ski day', () => {
    expect(hourLabel(16)).toBe('20:00');
    expect(hourLabel(20)).toBe('00:00');
    expect(hourLabel(23)).toBe('03:00');
  });

  it('moves to the next bucket on the hour', () => {
    const rides = ridesFrom([at(59), at(60)]);
    expect(rides.map((ride) => hourOf(ride))).toEqual([5, 6]);
  });
});

describe('the hourly profile', () => {
  const rides = () =>
    ridesFrom([at(0), at(20), at(70), at(80, { media: CARD_TESS, terminal: 'MEADW.01' }), at(200)]);

  it('gives one bucket per hour that carried anybody', () => {
    const buckets = hourlyProfile(rides());
    expect(buckets.map((bucket) => bucket.hour)).toEqual([5, 6, 8]);
    expect(buckets[0]?.rides).toBe(2);
    expect(buckets[1]?.rides).toBe(2);
  });

  it('counts riders separately from rides', () => {
    const buckets = hourlyProfile(rides());
    expect(buckets[1]?.riders).toBe(2);
    expect(buckets[0]?.riders).toBe(1);
  });

  it('adds the vertical per bucket', () => {
    expect(hourlyProfile(rides())[0]?.verticalFt).toBe(2480);
  });

  it('names the busiest hour and breaks a tie on the earlier one', () => {
    expect(busiestHour(rides())?.hour).toBe(5);
    expect(busiestHour([])).toBeUndefined();
  });

  it('counts what one hour delivered', () => {
    expect(ridesPerHourDelivered(rides(), 5)).toBe(2);
    expect(ridesPerHourDelivered(rides(), 7)).toBe(0);
  });

  it('gives nothing for no rides', () => {
    expect(hourlyProfile([])).toEqual([]);
  });
});

describe('per lift profiles', () => {
  it('gives one per lift, busiest peak first', () => {
    const profiles = liftHourlyProfiles(
      ridesFrom([at(0), at(20), at(40), at(10, { media: CARD_TESS, terminal: 'MEADW.01' })]),
    );
    expect(profiles.map((profile) => profile.lift)).toEqual(['SUNB', 'MEADW']);
    expect(profiles[0]?.peakRides).toBe(3);
    expect(profiles[0]?.peakHour).toBe(5);
    expect(profiles[1]?.buckets).toHaveLength(1);
  });

  it('gives nothing for no rides', () => {
    expect(liftHourlyProfiles([])).toEqual([]);
  });
});

describe('what the area actually carried', () => {
  it('divides the vertical by the hours it was turning', () => {
    const delivered = uphillDelivered(day('2025-01-13'), ridesFrom([at(0), at(70)]));
    expect(delivered).toMatchObject({ rides: 2, verticalFt: 2480, hoursTurning: 2 });
    expect(delivered.verticalPerHour).toBe(1240);
  });

  it('gives zeroes for a day nobody skied', () => {
    expect(uphillDelivered(day('2025-01-14'), [])).toMatchObject({
      rides: 0,
      verticalFt: 0,
      verticalPerHour: 0,
      hoursTurning: 0,
    });
  });
});
