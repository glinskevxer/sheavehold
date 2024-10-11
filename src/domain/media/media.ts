import {
  parseMediaSerial,
  parsePrintedId,
  type MediaSerial,
  type PrintedId,
} from '../../util/ids.js';
import { err, ok, type Result } from '../../util/result.js';

/**
 * Media is the physical thing with the tag in it. It is not the pass and it is
 * not the person. A guest who loses a card gets a new serial against the same
 * entitlement, and a card handed back at the end of a rental goes out again to
 * somebody else next week, so the same serial can belong to two people in one
 * season. Everything that resolves a scan has to resolve it as of the moment
 * the scan happened, never as of now.
 */

export type MediaForm = 'hard_card' | 'wallet' | 'wristband' | 'phone';

export type MediaStatus = 'active' | 'lost' | 'returned' | 'destroyed';

export interface Media {
  readonly serial: MediaSerial;
  readonly printedId: PrintedId;
  readonly form: MediaForm;
  readonly issuedAt: Date;
  readonly status: MediaStatus;
  /** Rental stock comes back and goes out again. Owned media does not. */
  readonly reusable: boolean;
}

const FORMS: readonly MediaForm[] = ['hard_card', 'wallet', 'wristband', 'phone'];
const STATUSES: readonly MediaStatus[] = ['active', 'lost', 'returned', 'destroyed'];

export function isMediaForm(value: string): value is MediaForm {
  return (FORMS as readonly string[]).includes(value);
}

export function isMediaStatus(value: string): value is MediaStatus {
  return (STATUSES as readonly string[]).includes(value);
}

export interface MediaInput {
  readonly serial: string;
  readonly printedId: string;
  readonly form: string;
  readonly issuedAt: Date;
  readonly status: string;
  readonly reusable?: boolean;
}

export function makeMedia(input: MediaInput): Result<Media> {
  const serial = parseMediaSerial(input.serial);
  if (!serial.ok) return serial;
  const printedId = parsePrintedId(input.printedId);
  if (!printedId.ok) return printedId;
  if (!isMediaForm(input.form)) return err(`media ${input.serial} is a ${input.form}`);
  if (!isMediaStatus(input.status)) return err(`media ${input.serial} is ${input.status}`);
  if (Number.isNaN(input.issuedAt.getTime())) {
    return err(`media ${input.serial} has no issue date`);
  }
  const reusable = input.reusable ?? input.form === 'hard_card';
  if (input.form === 'phone' && reusable) {
    return err(`media ${input.serial} is a phone and cannot be reissued`);
  }
  return ok({
    serial: serial.value,
    printedId: printedId.value,
    form: input.form,
    issuedAt: input.issuedAt,
    status: input.status,
    reusable,
  });
}
