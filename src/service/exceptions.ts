import type { OperatingDate } from '../util/clock.js';
import { DiagnosticBag } from '../util/diagnostic.js';
import { err, ok, type Result } from '../util/result.js';
import type { LiftRegistry } from '../domain/lift/lift.js';
import { findSameLiftPassbacks } from '../domain/exception/passback.js';
import { findImpossibleTransfers, type TransferMap } from '../domain/exception/transfer.js';
import {
  type ExceptionRegister,
  fromPassback,
  fromTransfer,
  isDisposition,
  type Disposition,
  type ExceptionRow,
} from '../domain/exception/register.js';
import type { GuestDirectory } from '../domain/guest/guest.js';
import type { RideStore } from '../storage/repository/rides.js';

/**
 * Running the fraud rules over a day and putting what they find in front of
 * somebody. Two things here are deliberate and both cost money to get wrong.
 *
 * A finding between two members of one household is downgraded rather than
 * dropped. Families do hand a card over, it is still against the rules, and a
 * supervisor should see it, but waking somebody at seven in the morning for it
 * is how the whole register got ignored the first season.
 *
 * And an override is a decision by a person with a name on it. The register
 * never decides anything itself.
 */

export interface ExceptionScanContext {
  readonly rides: RideStore;
  readonly register: ExceptionRegister;
  readonly lifts: LiftRegistry;
  readonly transfers: TransferMap;
  readonly guests: GuestDirectory;
}

export interface ExceptionScanResult {
  readonly date: OperatingDate;
  readonly found: number;
  readonly added: number;
  readonly kept: number;
  readonly dropped: number;
  readonly softened: number;
  readonly diagnostics: DiagnosticBag;
}

/** A finding between two people on one account is worth less attention. */
function soften(row: ExceptionRow, guests: GuestDirectory, rides: RideStore): ExceptionRow {
  const involved = row.evidence
    .map((rideId) => rides.rides.get(rideId)?.guestId)
    .filter((guestId): guestId is string => guestId !== undefined);
  const [first, second] = involved;
  if (first === undefined || second === undefined) return row;
  if (first === second) return row;
  if (!guests.sameHousehold(first, second)) return row;
  return { ...row, severity: 'low', note: 'both riders are on one account' };
}

export function scanDateForExceptions(
  date: OperatingDate,
  context: ExceptionScanContext,
): ExceptionScanResult {
  const diagnostics = new DiagnosticBag();
  const rides = context.rides.ridesOn(date);

  const passbacks = findSameLiftPassbacks(rides, { lifts: context.lifts }).map((finding) =>
    fromPassback(finding, date),
  );
  const transfers = findImpossibleTransfers(rides, {
    lifts: context.lifts,
    transfers: context.transfers,
  }).map((finding) => fromTransfer(finding, date));

  const raw = [...passbacks, ...transfers];
  let softened = 0;
  const findings = raw.map((row) => {
    const next = soften(row, context.guests, context.rides);
    if (next !== row) softened += 1;
    return next;
  });

  const outcome = context.register.reconcile(date, findings);
  if (findings.length > 0) {
    diagnostics.warn('exceptions.found', `${findings.length} findings on ${date}`, {
      date,
      found: findings.length,
    });
  }

  return {
    date,
    found: findings.length,
    added: outcome.added,
    kept: outcome.kept,
    dropped: outcome.dropped,
    softened,
    diagnostics,
  };
}

export interface OverrideInput {
  readonly exceptionId: string;
  readonly disposition: string;
  readonly by: string;
  readonly note?: string | undefined;
  readonly at?: Date | undefined;
}

export interface OverrideRecord {
  readonly exceptionId: string;
  readonly from: Disposition;
  readonly to: Disposition;
  readonly by: string;
  readonly at: Date;
  readonly note: string;
}

/**
 * A supervisor changing their mind about a row. The previous disposition is
 * kept in the record rather than overwritten, because who cleared this and what
 * it said before is the first question anybody asks in April.
 */
export function applyOverride(
  register: ExceptionRegister,
  input: OverrideInput,
): Result<OverrideRecord> {
  if (!isDisposition(input.disposition)) {
    return err(`${input.disposition} is not a disposition`);
  }
  const before = register.get(input.exceptionId);
  if (before === undefined) return err(`no exception ${input.exceptionId}`);
  const at = input.at ?? new Date();
  const decision: { disposition: Disposition; by: string; at: Date; note?: string } = {
    disposition: input.disposition,
    by: input.by,
    at,
  };
  if (input.note !== undefined) decision.note = input.note;
  const decided = register.decide(input.exceptionId, decision);
  if (!decided.ok) return decided;
  return ok({
    exceptionId: input.exceptionId,
    from: before.disposition,
    to: decided.value.disposition,
    by: decided.value.decidedBy ?? input.by,
    at,
    note: decided.value.note,
  });
}

/** What the morning sheet prints under the exception heading. */
export function openWorkload(register: ExceptionRegister): {
  open: number;
  high: number;
  oldest: OperatingDate | undefined;
} {
  const open = register.open();
  return {
    open: open.length,
    high: open.filter((row) => row.severity === 'high').length,
    oldest: open[0]?.operatingDate,
  };
}
