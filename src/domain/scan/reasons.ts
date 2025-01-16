import { tallyBy } from '../../util/collect.js';
import type { Severity } from '../../util/diagnostic.js';
import type { RefusalCode } from './admission.js';
import type { AuthorisationDenial, AuthorisationResult } from './authorise.js';

/**
 * One table for every way a read can fail, because three parts of the system
 * need to agree about them and they used to disagree. The maze gate shows the
 * `display` text on its little screen, the exception register groups by
 * `bucket`, and the daily report only counts the ones marked `countsAsTurnaway`.
 *
 * `fault` is the one worth reading twice. A gate that was out of service is our
 * problem, not the guest's, and counting those against the guest turned a
 * broken reader on Bowl into two hundred angry season pass holders in the
 * February report.
 */

export type ScanRejection = RefusalCode | AuthorisationDenial;

export type Fault = 'guest' | 'area' | 'data';

export type RejectionBucket = 'access' | 'validity' | 'equipment' | 'record';

export interface RejectionInfo {
  readonly code: ScanRejection;
  readonly label: string;
  /** What the gate screen shows. Kept short, the display is sixteen columns. */
  readonly display: string;
  readonly fault: Fault;
  readonly bucket: RejectionBucket;
  readonly severity: Severity;
  /** Counts in the turnaway figure on the daily report. */
  readonly countsAsTurnaway: boolean;
  /** Opens a row in the exception register for somebody to look at. */
  readonly raisesException: boolean;
}

const TABLE: readonly RejectionInfo[] = [
  {
    code: 'unknown_media',
    label: 'media not on file',
    display: 'SEE TICKET OFC',
    fault: 'data',
    bucket: 'record',
    severity: 'error',
    countsAsTurnaway: false,
    raisesException: true,
  },
  {
    code: 'media_retired',
    label: 'media was retired',
    display: 'CARD RETIRED',
    fault: 'guest',
    bucket: 'record',
    severity: 'warning',
    countsAsTurnaway: true,
    raisesException: true,
  },
  {
    code: 'no_binding',
    label: 'media carried nothing',
    display: 'SEE TICKET OFC',
    fault: 'data',
    bucket: 'record',
    severity: 'error',
    countsAsTurnaway: false,
    raisesException: true,
  },
  {
    code: 'gate_out_of_service',
    label: 'gate out of service',
    display: 'GATE CLOSED',
    fault: 'area',
    bucket: 'equipment',
    severity: 'warning',
    countsAsTurnaway: false,
    raisesException: false,
  },
  {
    code: 'download_gate',
    label: 'download gate',
    display: 'DOWNLOAD ONLY',
    fault: 'area',
    bucket: 'equipment',
    severity: 'info',
    countsAsTurnaway: false,
    raisesException: false,
  },
  {
    code: 'no_entitlement',
    label: 'no entitlement',
    display: 'SEE TICKET OFC',
    fault: 'data',
    bucket: 'record',
    severity: 'error',
    countsAsTurnaway: false,
    raisesException: true,
  },
  {
    code: 'no_product',
    label: 'product not in catalogue',
    display: 'SEE TICKET OFC',
    fault: 'data',
    bucket: 'record',
    severity: 'error',
    countsAsTurnaway: false,
    raisesException: true,
  },
  {
    code: 'voided',
    label: 'pass voided',
    display: 'PASS VOIDED',
    fault: 'guest',
    bucket: 'access',
    severity: 'warning',
    countsAsTurnaway: true,
    raisesException: true,
  },
  {
    code: 'not_yet_valid',
    label: 'not valid yet',
    display: 'NOT VALID YET',
    fault: 'guest',
    bucket: 'validity',
    severity: 'info',
    countsAsTurnaway: true,
    raisesException: false,
  },
  {
    code: 'expired',
    label: 'expired',
    display: 'EXPIRED',
    fault: 'guest',
    bucket: 'validity',
    severity: 'info',
    countsAsTurnaway: true,
    raisesException: false,
  },
  {
    code: 'blackout',
    label: 'blacked out',
    display: 'BLACKOUT DAY',
    fault: 'guest',
    bucket: 'validity',
    severity: 'info',
    countsAsTurnaway: true,
    raisesException: false,
  },
  {
    code: 'dated_blackout',
    label: 'blacked out by date',
    display: 'BLACKOUT DAY',
    fault: 'guest',
    bucket: 'validity',
    severity: 'info',
    countsAsTurnaway: true,
    raisesException: false,
  },
  {
    code: 'lift_not_in_scope',
    label: 'not valid on this lift',
    display: 'WRONG LIFT',
    fault: 'guest',
    bucket: 'access',
    severity: 'info',
    countsAsTurnaway: true,
    raisesException: false,
  },
  {
    code: 'days_exhausted',
    label: 'no days left',
    display: 'NO DAYS LEFT',
    fault: 'guest',
    bucket: 'validity',
    severity: 'info',
    countsAsTurnaway: true,
    raisesException: false,
  },
  {
    code: 'entry_cap',
    label: 'daily entries used',
    display: 'ENTRY LIMIT',
    fault: 'guest',
    bucket: 'access',
    severity: 'info',
    countsAsTurnaway: true,
    raisesException: false,
  },
];

const BY_CODE = new Map<string, RejectionInfo>(TABLE.map((info) => [info.code, info]));

export function rejectionInfo(code: ScanRejection): RejectionInfo {
  const info = BY_CODE.get(code);
  if (info === undefined) throw new Error(`no rejection info for ${code}`);
  return info;
}

export function allRejections(): readonly RejectionInfo[] {
  return TABLE;
}

export function rejectionsInBucket(bucket: RejectionBucket): RejectionInfo[] {
  return TABLE.filter((info) => info.bucket === bucket);
}

export function rejectionsByFault(fault: Fault): RejectionInfo[] {
  return TABLE.filter((info) => info.fault === fault);
}

export function gateDisplay(code: ScanRejection): string {
  return rejectionInfo(code).display;
}

/** The rejection a finished authorisation carries, or nothing if it passed. */
export function rejectionOf(result: AuthorisationResult): ScanRejection | undefined {
  if (result.allowed) return undefined;
  if (result.denial !== undefined && result.denial !== 'no_entitlement') return result.denial;
  return result.admission.refusal ?? result.denial ?? 'no_entitlement';
}

export function turnaways(results: readonly AuthorisationResult[]): AuthorisationResult[] {
  return results.filter((result) => {
    const code = rejectionOf(result);
    return code !== undefined && rejectionInfo(code).countsAsTurnaway;
  });
}

export function exceptionWorthy(results: readonly AuthorisationResult[]): AuthorisationResult[] {
  return results.filter((result) => {
    const code = rejectionOf(result);
    return code !== undefined && rejectionInfo(code).raisesException;
  });
}

export function rejectionTally(
  results: readonly AuthorisationResult[],
): Map<ScanRejection, number> {
  return tallyBy(results, rejectionOf);
}
