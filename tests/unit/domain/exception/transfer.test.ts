import { describe, expect, it } from 'vitest';
import {
  findImpossibleTransfers,
  requiredTransferMinutes,
  TransferMap,
  worstShortfall,
} from '../../../../src/domain/exception/transfer.js';
import { parseLiftCode, type LiftCode } from '../../../../src/util/ids.js';
import { expect as expectOk } from '../../../../src/util/result.js';
import { lifts, ridesFrom, type ScanSpec } from '../../../support/pipeline.js';
import { transferMap } from '../../../support/transfers.js';

const lift = (raw: string): LiftCode => expectOk(parseLiftCode(raw), 'lift');

function at(minutes: number, terminal: string, overrides: Partial<ScanSpec> = {}): ScanSpec {
  const base = new Date('2025-01-13T16:00:00Z').getTime();
  return { at: new Date(base + minutes * 60_000).toISOString(), terminal, ...overrides };
}

const options = () => ({ lifts: lifts(), transfers: transferMap() });

describe('the transfer table', () => {
  it('answers in one direction and not the other by accident', () => {
    const map = transferMap();
    expect(map.get(lift('SUNB'), lift('RIDGE'))).toBe(6);
    expect(map.get(lift('RIDGE'), lift('SUNB'))).toBe(9);
    expect(map.get(lift('BOWL'), lift('CRPT'))).toBeUndefined();
    expect(map.has(lift('SUNB'), lift('RIDGE'))).toBe(true);
    expect(map.size).toBe(8);
  });

  it('refuses a negative or unreadable time', () => {
    const map = new TransferMap();
    expect(() => map.set(lift('SUNB'), lift('BOWL'), -1)).toThrow('takes -1 minutes');
    expect(() => map.set(lift('SUNB'), lift('BOWL'), Number.NaN)).toThrow();
  });

  it('lists the pairs nobody has walked yet', () => {
    const missing = transferMap().missingPairs(lifts());
    expect(missing.length).toBe(12);
    expect(missing.some((entry) => entry.from === entry.to)).toBe(false);
    expect(missing.some((entry) => entry.from === 'SUNB' && entry.to === 'RIDGE')).toBe(false);
  });
});

describe('what a transfer needs', () => {
  it('is the first ride plus the walk', () => {
    const rides = ridesFrom([at(0, 'SUNB.01'), at(20, 'RIDGE.01')]);
    expect(requiredTransferMinutes(rides[0]!, rides[1]!, options())).toBe(13.5);
  });

  it('leaves the ride out when asked', () => {
    const rides = ridesFrom([at(0, 'SUNB.01'), at(20, 'RIDGE.01')]);
    expect(
      requiredTransferMinutes(rides[0]!, rides[1]!, { ...options(), includeRideTime: false }),
    ).toBe(6);
  });

  it('answers nothing for a pair nobody walked', () => {
    const rides = ridesFrom([at(0, 'BOWL.01'), at(20, 'CRPT.01')]);
    expect(requiredTransferMinutes(rides[0]!, rides[1]!, options())).toBeUndefined();
  });
});

describe('finding an impossible transfer', () => {
  it('flags a card at two lifts too close together', () => {
    const rides = ridesFrom([at(0, 'RIDGE.01'), at(4, 'BOWL.01')]);
    const found = findImpossibleTransfers(rides, options());
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      fromLift: 'RIDGE',
      toLift: 'BOWL',
      gapMinutes: 7,
      requiredMinutes: 15,
      shortfallMinutes: 8,
    });
  });

  it('leaves an honest traverse alone', () => {
    const rides = ridesFrom([at(0, 'RIDGE.01'), at(20, 'BOWL.01')]);
    expect(findImpossibleTransfers(rides, options())).toEqual([]);
  });

  it('leaves two rides on one lift to the other rule', () => {
    const rides = ridesFrom([at(0, 'SUNB.01'), at(2, 'SUNB.01')]);
    expect(findImpossibleTransfers(rides, options())).toEqual([]);
  });

  it('says nothing about a pair with no measured time', () => {
    const rides = ridesFrom([at(0, 'BOWL.01'), at(1, 'CRPT.01')]);
    expect(findImpossibleTransfers(rides, options())).toEqual([]);
  });

  it('sorts the worst shortfall first', () => {
    const rides = ridesFrom([
      at(0, 'RIDGE.01'),
      at(4, 'BOWL.01'),
      at(30, 'SUNB.01'),
      at(33, 'MEADW.01'),
    ]);
    const found = findImpossibleTransfers(rides, options());
    expect(found).toHaveLength(2);
    expect(worstShortfall(found)?.shortfallMinutes).toBe(9.6);
    expect(found[1]?.fromLift).toBe('RIDGE');
  });

  it('finds nothing in an empty day', () => {
    expect(findImpossibleTransfers([], options())).toEqual([]);
    expect(worstShortfall([])).toBeUndefined();
  });
});
