import { TransferMap } from '../../src/domain/exception/transfer.js';
import { parseLiftCode, type LiftCode } from '../../src/util/ids.js';
import { expect as expectOk } from '../../src/util/result.js';

const lift = (raw: string): LiftCode => expectOk(parseLiftCode(raw), 'lift');

/** Walked and timed by the patrol director in December 2024. */
export function transferMap(): TransferMap {
  return TransferMap.from([
    { from: lift('SUNB'), to: lift('RIDGE'), minutes: 6 },
    { from: lift('RIDGE'), to: lift('SUNB'), minutes: 9 },
    { from: lift('RIDGE'), to: lift('BOWL'), minutes: 4 },
    { from: lift('BOWL'), to: lift('RIDGE'), minutes: 7 },
    { from: lift('SUNB'), to: lift('MEADW'), minutes: 5 },
    { from: lift('MEADW'), to: lift('SUNB'), minutes: 3 },
    { from: lift('MEADW'), to: lift('CRPT'), minutes: 2 },
    { from: lift('CRPT'), to: lift('MEADW'), minutes: 2 },
  ]);
}
