import { describe, expect, it } from 'vitest';
import {
  gateOfTerminal,
  liftOfTerminal,
  parseLiftCode,
  parseMediaSerial,
  parsePrintedId,
  parseTerminalId,
  printedIdChecksum,
  terminalId,
  type LiftCode,
} from '../../../src/util/ids.js';
import { expect as expectOk, isErr } from '../../../src/util/result.js';

describe('identifiers', () => {
  it('accepts a lift code and folds it to upper case', () => {
    expect(expectOk(parseLiftCode('sunb'), 'lift')).toBe('SUNB');
    expect(expectOk(parseLiftCode('  RIDGE '), 'lift')).toBe('RIDGE');
  });

  it('refuses a lift code that is too short or carries digits', () => {
    expect(isErr(parseLiftCode('SUN'))).toBe(true);
    expect(isErr(parseLiftCode('SUNB1'))).toBe(true);
    expect(isErr(parseLiftCode('TOOLONGCODE'))).toBe(true);
  });

  it('splits a terminal id into its lift and its gate', () => {
    const terminal = expectOk(parseTerminalId('SUNB.03'), 'terminal');
    expect(liftOfTerminal(terminal)).toBe('SUNB');
    expect(gateOfTerminal(terminal)).toBe(3);
  });

  it('refuses a terminal id with a one digit gate', () => {
    expect(isErr(parseTerminalId('SUNB.3'))).toBe(true);
    expect(isErr(parseTerminalId('SUNB'))).toBe(true);
  });

  it('builds a terminal id and pads the gate number', () => {
    const lift = expectOk(parseLiftCode('RIDGE'), 'lift');
    expect(expectOk(terminalId(lift, 7), 'terminal')).toBe('RIDGE.07');
    expect(isErr(terminalId(lift, 0))).toBe(true);
    expect(isErr(terminalId(lift, 100))).toBe(true);
    expect(isErr(terminalId('X' as LiftCode, 2.5))).toBe(true);
  });

  it('takes an epc as sixteen hex digits in either case', () => {
    expect(expectOk(parseMediaSerial('e2004a1b00000123'), 'serial')).toBe('E2004A1B00000123');
    expect(isErr(parseMediaSerial('E2004A1B0000012'))).toBe(true);
    expect(isErr(parseMediaSerial('G2004A1B00000123'))).toBe(true);
  });

  it('takes a printed id only in its grouped form', () => {
    expect(expectOk(parsePrintedId('4021-8830-1174'), 'printed')).toBe('4021-8830-1174');
    expect(isErr(parsePrintedId('402188301174'))).toBe(true);
  });

  it('computes the printed id checksum over alternating weights', () => {
    const printed = expectOk(parsePrintedId('1111-1111-1111'), 'printed');
    expect(printedIdChecksum(printed)).toBe(4);
  });
});
