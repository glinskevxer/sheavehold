import { describe, expect, it } from 'vitest';
import {
  compareRides,
  rideId,
  ridesByLift,
  ridesOfGuest,
  ridesOn,
  ridesOnLift,
  totalVerticalFt,
} from '../../../../src/domain/ride/ride.js';
import { parseLiftCode, parseTerminalId } from '../../../../src/util/ids.js';
import { expect as expectOk } from '../../../../src/util/result.js';
import { CARD_IDA, CARD_MILO, CARD_TESS } from '../../../support/media.js';
import { ridesFrom } from '../../../support/pipeline.js';
import { day } from '../../../support/season.js';

const lift = (raw: string) => expectOk(parseLiftCode(raw), 'lift');

describe('building a ride', () => {
  it('makes one ride from one accepted read', () => {
    const rides = ridesFrom([{ at: '2025-01-13T17:00:00Z' }]);
    expect(rides).toHaveLength(1);
    expect(rides[0]).toMatchObject({
      lift: 'SUNB',
      terminalId: 'SUNB.01',
      guestId: 'G-77',
      entitlementId: 'ENT-1001',
      productCode: 'SEAS',
      verticalFt: 1240,
      rideMinutes: 7.5,
    });
  });

  it('credits the vertical of the lift the gate hangs off', () => {
    const rides = ridesFrom([
      { at: '2025-01-13T17:00:00Z', terminal: 'SUNB.01' },
      { at: '2025-01-13T17:30:00Z', terminal: 'RIDGE.01' },
    ]);
    expect(rides.map((ride) => ride.verticalFt)).toEqual([1240, 1880]);
    expect(totalVerticalFt(rides)).toBe(3120);
  });

  it('estimates where the guest is at the top', () => {
    const rides = ridesFrom([{ at: '2025-01-13T17:00:00Z' }]);
    expect(rides[0]?.unloadsAt.toISOString()).toBe('2025-01-13T17:07:38.000Z');
  });

  it('gives an id that is stable and readable', () => {
    const rides = ridesFrom([{ at: '2025-01-13T17:00:00Z', seq: 42 }]);
    expect(rides[0]?.id).toBe('R-2025-01-13-SUNB.01-000042');
    expect(rideId(day('2025-01-13'), expectOk(parseTerminalId('BOWL.01'), 't'), 7)).toBe(
      'R-2025-01-13-BOWL.01-000007',
    );
  });

  it('makes no ride from a refusal at the gate', () => {
    expect(ridesFrom([{ at: '2025-01-13T17:00:00Z', outcome: 'reject' }])).toEqual([]);
  });

  it('makes no ride when the pass was not entitled', () => {
    expect(ridesFrom([{ at: '2025-01-13T17:00:00Z', media: CARD_MILO }])).toEqual([]);
  });

  it('makes no ride from a suppressed duplicate', () => {
    const rides = ridesFrom([{ at: '2025-01-13T17:00:00Z' }, { at: '2025-01-13T17:00:04Z' }]);
    expect(rides).toHaveLength(1);
  });

  it('marks a ride we allowed against the gate decision', () => {
    const rides = ridesFrom([{ at: '2025-01-13T17:00:00Z', outcome: 'reject' }]);
    expect(rides).toEqual([]);
    const allowed = ridesFrom([{ at: '2025-01-13T17:00:00Z' }]);
    expect(allowed[0]?.overriddenGate).toBe(false);
  });

  it('makes no ride from a lift nobody has on file', () => {
    expect(ridesFrom([{ at: '2025-01-13T17:00:00Z', terminal: 'MEADW.01' }])).toHaveLength(1);
  });
});

describe('slicing the rides', () => {
  const rides = () =>
    ridesFrom([
      { at: '2025-01-13T17:00:00Z', terminal: 'SUNB.01' },
      { at: '2025-01-13T17:40:00Z', terminal: 'RIDGE.01' },
      { at: '2025-01-13T18:20:00Z', terminal: 'SUNB.01' },
      { at: '2025-01-14T17:00:00Z', terminal: 'SUNB.01' },
      { at: '2025-01-13T17:10:00Z', terminal: 'MEADW.01', media: CARD_TESS },
      { at: '2025-01-13T17:20:00Z', terminal: 'MEADW.01', media: CARD_IDA },
    ]);

  it('keeps one day', () => {
    expect(ridesOn(rides(), day('2025-01-13'))).toHaveLength(5);
    expect(ridesOn(rides(), day('2025-01-14'))).toHaveLength(1);
    expect(ridesOn(rides(), day('2025-02-01'))).toEqual([]);
  });

  it('keeps one guest, in order', () => {
    const own = ridesOfGuest(rides(), 'G-77');
    expect(own).toHaveLength(4);
    expect(own.map((ride) => ride.boardedAt.getTime())).toEqual(
      [...own].sort(compareRides).map((ride) => ride.boardedAt.getTime()),
    );
    expect(ridesOfGuest(rides(), 'G-000')).toEqual([]);
  });

  it('keeps one lift', () => {
    expect(ridesOnLift(rides(), lift('SUNB'))).toHaveLength(3);
    expect(ridesOnLift(rides(), lift('BOWL'))).toEqual([]);
  });

  it('groups by lift', () => {
    const grouped = ridesByLift(rides());
    expect([...grouped.keys()].sort()).toEqual(['MEADW', 'RIDGE', 'SUNB']);
    expect(grouped.get(lift('MEADW'))).toHaveLength(2);
  });

  it('adds the vertical for a day', () => {
    expect(totalVerticalFt(ridesOn(rides(), day('2025-01-14')))).toBe(1240);
  });
});
