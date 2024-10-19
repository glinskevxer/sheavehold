import { operatingDaysBetween, type OperatingDate } from '../../util/clock.js';
import { cents, type Cents } from '../../util/money.js';
import type { LiftCode } from '../../util/ids.js';
import { err, ok, type Result } from '../../util/result.js';
import type { DayClass } from '../calendar/season.js';
import { blacksOut, isUnlimited, scopeCovers, type Product } from './product.js';

/**
 * An entitlement is one sale. The product says what the rules are, the
 * entitlement says who bought it, what they paid and how much of it is left.
 *
 * The day counter is the awkward part. A three day ticket is not three
 * calendar days, it is three days on which the holder took at least one ride,
 * and which days those were is not known until the rides have been
 * sessionised. So `daysUsed` is a set that the recompute writes back, never
 * something the point of sale can tell us up front.
 */

export interface Entitlement {
  readonly id: string;
  readonly productCode: string;
  readonly guestId: string;
  readonly purchasedAt: Date;
  readonly pricePaid: Cents;
  /** Narrower than the product when the desk sold a dated ticket. */
  readonly validFrom: OperatingDate | undefined;
  readonly validTo: OperatingDate | undefined;
  readonly voidedAt: Date | undefined;
  readonly note: string;
}

export interface EntitlementInput {
  readonly id: string;
  readonly productCode: string;
  readonly guestId: string;
  readonly purchasedAt: Date;
  readonly pricePaidCents: number;
  readonly validFrom?: OperatingDate | undefined;
  readonly validTo?: OperatingDate | undefined;
  readonly voidedAt?: Date | undefined;
  readonly note?: string | undefined;
}

export function makeEntitlement(input: EntitlementInput): Result<Entitlement> {
  if (input.id.trim() === '') return err('an entitlement needs an id');
  if (input.productCode.trim() === '') return err(`entitlement ${input.id} has no product`);
  if (input.guestId.trim() === '') return err(`entitlement ${input.id} has no guest`);
  if (Number.isNaN(input.purchasedAt.getTime())) {
    return err(`entitlement ${input.id} has no purchase time`);
  }
  if (!Number.isInteger(input.pricePaidCents) || input.pricePaidCents < 0) {
    return err(`entitlement ${input.id} was sold for ${input.pricePaidCents}`);
  }
  if (
    input.validFrom !== undefined &&
    input.validTo !== undefined &&
    operatingDaysBetween(input.validFrom, input.validTo) < 0
  ) {
    return err(`entitlement ${input.id} expires before it starts`);
  }
  return ok({
    id: input.id.trim(),
    productCode: input.productCode.trim().toUpperCase(),
    guestId: input.guestId.trim(),
    purchasedAt: input.purchasedAt,
    pricePaid: cents(input.pricePaidCents),
    validFrom: input.validFrom,
    validTo: input.validTo,
    voidedAt: input.voidedAt,
    note: input.note?.trim() ?? '',
  });
}

export type EntitlementDenial =
  | 'voided'
  | 'not_yet_valid'
  | 'expired'
  | 'blackout'
  | 'lift_not_in_scope'
  | 'days_exhausted'
  | 'entry_cap';

export interface EntitlementDecision {
  readonly allowed: boolean;
  readonly reason: EntitlementDenial | undefined;
  /** True when the day is not one the holder has skied on before. */
  readonly consumesDay: boolean;
  readonly detail: string;
}

export interface EntitlementQuery {
  readonly entitlement: Entitlement;
  readonly product: Product;
  readonly lift: LiftCode;
  readonly date: OperatingDate;
  readonly dayClass: DayClass;
  readonly at: Date;
  /** Days this entitlement has already been used on, this one included or not. */
  readonly daysUsed: ReadonlySet<string>;
  /** Entries already admitted on this date against the daily cap. */
  readonly entriesToday: number;
}

function deny(reason: EntitlementDenial, detail: string): EntitlementDecision {
  return { allowed: false, reason, consumesDay: false, detail };
}

export function effectiveFrom(entitlement: Entitlement, product: Product): OperatingDate {
  const own = entitlement.validFrom;
  if (own === undefined) return product.validFrom;
  return own > product.validFrom ? own : product.validFrom;
}

export function effectiveTo(entitlement: Entitlement, product: Product): OperatingDate {
  const own = entitlement.validTo;
  if (own === undefined) return product.validTo;
  return own < product.validTo ? own : product.validTo;
}

/**
 * The order here is the order the maze gate reports a refusal in, and it is
 * deliberate. A voided pass is a security matter and outranks everything, and a
 * blackout is checked before the day counter so a midweek pass turned away on a
 * Saturday does not burn one of its days.
 */
export function checkEntitlement(query: EntitlementQuery): EntitlementDecision {
  const { entitlement, product, date } = query;

  if (entitlement.voidedAt !== undefined && entitlement.voidedAt.getTime() <= query.at.getTime()) {
    return deny('voided', `entitlement ${entitlement.id} was voided`);
  }
  const from = effectiveFrom(entitlement, product);
  const to = effectiveTo(entitlement, product);
  if (operatingDaysBetween(from, date) < 0) {
    return deny('not_yet_valid', `${product.code} is not valid until ${from}`);
  }
  if (operatingDaysBetween(date, to) < 0) {
    return deny('expired', `${product.code} ran out on ${to}`);
  }
  if (blacksOut(product, query.dayClass)) {
    return deny('blackout', `${product.code} is blacked out on a ${query.dayClass} day`);
  }
  if (!scopeCovers(product.liftScope, query.lift)) {
    return deny('lift_not_in_scope', `${product.code} does not ride ${query.lift}`);
  }

  const alreadySkiedToday = query.daysUsed.has(date);
  if (!isUnlimited(product) && !alreadySkiedToday && query.daysUsed.size >= product.dayCount) {
    return deny('days_exhausted', `${product.code} has used all ${product.dayCount} days`);
  }
  if (product.dailyEntryCap > 0 && query.entriesToday >= product.dailyEntryCap) {
    return deny('entry_cap', `${product.code} allows ${product.dailyEntryCap} entries a day`);
  }

  return {
    allowed: true,
    reason: undefined,
    consumesDay: !alreadySkiedToday && !isUnlimited(product),
    detail: alreadySkiedToday ? 'another ride on a day already counted' : 'first ride of the day',
  };
}

/** Days left on a counted product. Unlimited products answer with Infinity. */
export function daysRemaining(product: Product, daysUsed: ReadonlySet<string>): number {
  if (isUnlimited(product)) return Number.POSITIVE_INFINITY;
  return Math.max(0, product.dayCount - daysUsed.size);
}
