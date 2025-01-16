import type { OperatingDate } from '../../util/clock.js';
import type { MediaSerial } from '../../util/ids.js';
import type { BindingLedger } from '../media/binding.js';
import type { Media } from '../media/media.js';
import type { TerminalRegistry } from '../lift/terminal.js';
import { distinct } from '../../util/collect.js';
import type { NormalisedScan } from './normalise.js';

/**
 * Admission decides whether a normalised scan becomes a ride. It runs after
 * clock correction and before dedupe, which is the order that matters: a
 * refusal is still a person standing at the gate, so it counts toward the
 * queue proxy even though it never becomes a ride.
 *
 * The gate itself has already made its own decision and we record it, but we
 * do not trust it. Terminals run an offline entitlement cache that is up to a
 * day stale, and reconciling the two is half of what the exception register is
 * for.
 */

export type AdmissionOutcome = 'admitted' | 'refused';

export type RefusalCode =
  | 'unknown_media'
  | 'media_retired'
  | 'no_binding'
  | 'gate_out_of_service'
  | 'download_gate';

export interface AdmissionResult {
  readonly scan: NormalisedScan;
  readonly outcome: AdmissionOutcome;
  readonly refusal: RefusalCode | undefined;
  readonly entitlementId: string | undefined;
  readonly guestId: string | undefined;
  readonly detail: string;
  /** True when the gate let them on and we would not have, or the reverse. */
  readonly disagreesWithGate: boolean;
}

export interface AdmissionContext {
  readonly terminals: TerminalRegistry;
  readonly bindings: BindingLedger;
  readonly media: ReadonlyMap<string, Media>;
}

function refuse(scan: NormalisedScan, refusal: RefusalCode, detail: string): AdmissionResult {
  return {
    scan,
    outcome: 'refused',
    refusal,
    entitlementId: undefined,
    guestId: undefined,
    detail,
    disagreesWithGate: scan.outcome === 'accept',
  };
}

/**
 * Everything this stage can decide without knowing what the pass is. The
 * entitlement rules come next and they need the binding this stage resolves.
 */
export function admitScan(scan: NormalisedScan, context: AdmissionContext): AdmissionResult {
  const terminal = context.terminals.find(scan.terminalId);
  if (terminal === undefined || terminal.status !== 'live') {
    return refuse(scan, 'gate_out_of_service', `gate ${scan.terminalId} was not in service`);
  }
  if (terminal.direction === 'download') {
    return refuse(scan, 'download_gate', `gate ${scan.terminalId} loads downhill only`);
  }

  const media = context.media.get(scan.mediaSerial);
  if (media === undefined) {
    return refuse(scan, 'unknown_media', `media ${scan.mediaSerial} is not on file`);
  }
  if (media.status === 'destroyed') {
    return refuse(scan, 'media_retired', `media ${scan.mediaSerial} was destroyed`);
  }

  const binding = context.bindings.resolve(scan.mediaSerial, scan.at);
  if (binding === undefined) {
    return refuse(scan, 'no_binding', `media ${scan.mediaSerial} carried nothing at that moment`);
  }

  return {
    scan,
    outcome: 'admitted',
    refusal: undefined,
    entitlementId: binding.entitlementId,
    guestId: binding.guestId,
    detail: `${binding.entitlementId} for ${binding.guestId}`,
    disagreesWithGate: scan.outcome === 'reject',
  };
}

export function admitScans(
  scans: readonly NormalisedScan[],
  context: AdmissionContext,
): AdmissionResult[] {
  return scans.map((scan) => admitScan(scan, context));
}

export function admitted(results: readonly AdmissionResult[]): AdmissionResult[] {
  return results.filter((result) => result.outcome === 'admitted');
}

export function refused(results: readonly AdmissionResult[]): AdmissionResult[] {
  return results.filter((result) => result.outcome === 'refused');
}

export function disagreements(results: readonly AdmissionResult[]): AdmissionResult[] {
  return results.filter((result) => result.disagreesWithGate);
}

/** Media that turned up at a gate and resolved to nothing, worth chasing. */
export function unresolvedMedia(results: readonly AdmissionResult[]): MediaSerial[] {
  const chasing = results.filter(
    (result) => result.refusal === 'unknown_media' || result.refusal === 'no_binding',
  );
  return distinct(chasing, (result) => result.scan.mediaSerial).sort();
}

export function refusalsOnDate(
  results: readonly AdmissionResult[],
  date: OperatingDate,
): AdmissionResult[] {
  return refused(results).filter((result) => result.scan.operatingDate === date);
}
