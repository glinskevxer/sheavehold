import type { OperatingDate } from '../../util/clock.js';
import type { OperatingCalendar } from '../calendar/season.js';
import type { BlackoutRegistry } from '../product/blackout.js';
import {
  checkEntitlement,
  type Entitlement,
  type EntitlementDenial,
} from '../product/entitlement.js';
import type { Product } from '../product/product.js';
import type { AdmissionResult } from './admission.js';

/**
 * The second half of the gate decision. Admission answered "is this a person we
 * know"; this answers "may that person ride this lift today".
 *
 * The day counter is the reason this cannot be a pure function of one scan. A
 * three day ticket only knows it is spent once the earlier days have been
 * counted, so the ledger below is threaded through the batch in time order and
 * written to as it goes. Feeding the batch in out of order gives a different
 * answer, which is exactly why normalisation sorts before this runs.
 */

export type AuthorisationDenial =
  | EntitlementDenial
  | 'dated_blackout'
  | 'no_entitlement'
  | 'no_product';

export interface AuthorisationResult {
  readonly admission: AdmissionResult;
  readonly allowed: boolean;
  readonly denial: AuthorisationDenial | undefined;
  readonly detail: string;
  readonly consumedDay: boolean;
  readonly entitlementId: string | undefined;
  readonly productCode: string | undefined;
}

/**
 * What each entitlement has spent. Kept outside the check so a recompute can
 * rebuild it from scratch and a live ingest can carry it forward.
 */
export class DayUseLedger {
  private readonly daysByEntitlement = new Map<string, Set<string>>();
  private readonly entriesByDay = new Map<string, number>();

  static from(rows: readonly { entitlementId: string; date: OperatingDate }[]): DayUseLedger {
    const ledger = new DayUseLedger();
    for (const row of rows) ledger.useDay(row.entitlementId, row.date);
    return ledger;
  }

  daysUsed(entitlementId: string): ReadonlySet<string> {
    return this.daysByEntitlement.get(entitlementId) ?? new Set<string>();
  }

  entriesOn(entitlementId: string, date: OperatingDate): number {
    return this.entriesByDay.get(`${entitlementId}#${date}`) ?? 0;
  }

  useDay(entitlementId: string, date: OperatingDate): void {
    const days = this.daysByEntitlement.get(entitlementId) ?? new Set<string>();
    days.add(date);
    this.daysByEntitlement.set(entitlementId, days);
  }

  countEntry(entitlementId: string, date: OperatingDate): void {
    const key = `${entitlementId}#${date}`;
    this.entriesByDay.set(key, (this.entriesByDay.get(key) ?? 0) + 1);
  }

  entitlements(): string[] {
    return [...this.daysByEntitlement.keys()].sort();
  }

  clear(): void {
    this.daysByEntitlement.clear();
    this.entriesByDay.clear();
  }
}

export interface AuthorisationContext {
  readonly entitlements: ReadonlyMap<string, Entitlement>;
  readonly products: { find(code: string): Product | undefined };
  readonly calendar: OperatingCalendar;
  readonly blackouts: BlackoutRegistry;
  readonly ledger: DayUseLedger;
}

function deny(
  admission: AdmissionResult,
  denial: AuthorisationDenial,
  detail: string,
  entitlementId?: string,
  productCode?: string,
): AuthorisationResult {
  return {
    admission,
    allowed: false,
    denial,
    detail,
    consumedDay: false,
    entitlementId,
    productCode,
  };
}

export function authoriseScan(
  admission: AdmissionResult,
  context: AuthorisationContext,
): AuthorisationResult {
  if (admission.outcome === 'refused' || admission.entitlementId === undefined) {
    return deny(admission, 'no_entitlement', admission.detail);
  }
  const entitlement = context.entitlements.get(admission.entitlementId);
  if (entitlement === undefined) {
    return deny(
      admission,
      'no_entitlement',
      `entitlement ${admission.entitlementId} is not on file`,
    );
  }
  const product = context.products.find(entitlement.productCode);
  if (product === undefined) {
    return deny(
      admission,
      'no_product',
      `product ${entitlement.productCode} is not in the catalogue`,
      entitlement.id,
    );
  }

  const date = admission.scan.operatingDate;
  const dayClass = context.calendar.plan(date).dayClass;
  const decision = checkEntitlement({
    entitlement,
    product,
    lift: admission.scan.lift,
    date,
    dayClass,
    at: admission.scan.at,
    daysUsed: context.ledger.daysUsed(entitlement.id),
    entriesToday: context.ledger.entriesOn(entitlement.id, date),
  });

  if (!decision.allowed && decision.reason !== undefined) {
    return deny(admission, decision.reason, decision.detail, entitlement.id, product.code);
  }

  const hit = context.blackouts.check({
    product,
    entitlementId: entitlement.id,
    date,
    dayClass,
    purchasedAt: entitlement.purchasedAt,
  });
  if (hit !== undefined) {
    return deny(
      admission,
      'dated_blackout',
      `${hit.label} is blacked out`,
      entitlement.id,
      product.code,
    );
  }

  context.ledger.countEntry(entitlement.id, date);
  if (decision.consumesDay) context.ledger.useDay(entitlement.id, date);

  return {
    admission,
    allowed: true,
    denial: undefined,
    detail: decision.detail,
    consumedDay: decision.consumesDay,
    entitlementId: entitlement.id,
    productCode: product.code,
  };
}

/** In time order, because the day counter depends on what came before. */
export function authoriseScans(
  admissions: readonly AdmissionResult[],
  context: AuthorisationContext,
): AuthorisationResult[] {
  return admissions.map((admission) => authoriseScan(admission, context));
}

export function allowedOnly(results: readonly AuthorisationResult[]): AuthorisationResult[] {
  return results.filter((result) => result.allowed);
}

export function deniedOnly(results: readonly AuthorisationResult[]): AuthorisationResult[] {
  return results.filter((result) => !result.allowed);
}

export function denialTally(
  results: readonly AuthorisationResult[],
): Map<AuthorisationDenial, number> {
  const counts = new Map<AuthorisationDenial, number>();
  for (const result of results) {
    if (result.denial === undefined) continue;
    counts.set(result.denial, (counts.get(result.denial) ?? 0) + 1);
  }
  return counts;
}
