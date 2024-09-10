import { err, ok, type Result } from './result.js';

/**
 * Identifier shapes as they appear on the mountain. Every one of these is
 * printed on something physical, so the parsers are deliberately strict: a
 * terminal that reports a lift code we do not recognise is a configuration
 * fault worth stopping on, not a row to guess at.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Short code stencilled on the lift shack, four to six upper case letters. */
export type LiftCode = Brand<string, 'LiftCode'>;

/** A gate reader, addressed as the lift code plus a two digit gate number. */
export type TerminalId = Brand<string, 'TerminalId'>;

/** The EPC written to the tag in the media, sixteen upper case hex digits. */
export type MediaSerial = Brand<string, 'MediaSerial'>;

/** The number a guest can read off the front of the card, 4-4-4 digits. */
export type PrintedId = Brand<string, 'PrintedId'>;

const LIFT_CODE = /^[A-Z]{4,6}$/;
const TERMINAL_ID = /^([A-Z]{4,6})\.([0-9]{2})$/;
const MEDIA_SERIAL = /^[0-9A-F]{16}$/;
const PRINTED_ID = /^[0-9]{4}-[0-9]{4}-[0-9]{4}$/;

export function parseLiftCode(raw: string): Result<LiftCode> {
  const value = raw.trim().toUpperCase();
  if (!LIFT_CODE.test(value))
    return err(`lift code ${JSON.stringify(raw)} is not four to six letters`);
  return ok(value as LiftCode);
}

export function parseTerminalId(raw: string): Result<TerminalId> {
  const value = raw.trim().toUpperCase();
  if (!TERMINAL_ID.test(value)) return err(`terminal id ${JSON.stringify(raw)} is not LIFT.NN`);
  return ok(value as TerminalId);
}

export function parseMediaSerial(raw: string): Result<MediaSerial> {
  const value = raw.trim().toUpperCase();
  if (!MEDIA_SERIAL.test(value))
    return err(`media serial ${JSON.stringify(raw)} is not sixteen hex digits`);
  return ok(value as MediaSerial);
}

export function parsePrintedId(raw: string): Result<PrintedId> {
  const value = raw.trim();
  if (!PRINTED_ID.test(value))
    return err(`printed id ${JSON.stringify(raw)} is not 0000-0000-0000`);
  return ok(value as PrintedId);
}

/** The lift a terminal hangs off. Terminals are never moved between lifts. */
export function liftOfTerminal(terminal: TerminalId): LiftCode {
  const match = TERMINAL_ID.exec(terminal);
  if (match === null || match[1] === undefined) {
    throw new Error(`terminal id ${terminal} lost its shape`);
  }
  return match[1] as LiftCode;
}

/** Gate number within the maze, one based. Gate 01 is the far skier's left. */
export function gateOfTerminal(terminal: TerminalId): number {
  const match = TERMINAL_ID.exec(terminal);
  if (match === null || match[2] === undefined) {
    throw new Error(`terminal id ${terminal} lost its shape`);
  }
  return Number.parseInt(match[2], 10);
}

export function terminalId(lift: LiftCode, gate: number): Result<TerminalId> {
  if (!Number.isInteger(gate) || gate < 1 || gate > 99) {
    return err(`gate number ${gate} is outside 1 to 99`);
  }
  return ok(`${lift}.${String(gate).padStart(2, '0')}` as TerminalId);
}

/**
 * The printed number is a check digit scheme, not a slice of the EPC, so the
 * two identifiers never derive from one another. This only validates.
 */
export function printedIdChecksum(printed: PrintedId): number {
  const digits = printed.replace(/-/g, '');
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    const digit = Number(digits[i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return sum % 10;
}
