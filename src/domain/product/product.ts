import type { DayClass } from '../calendar/season.js';
import { parseLiftCode, type LiftCode } from '../../util/ids.js';
import { parseOperatingDate, type OperatingDate } from '../../util/clock.js';
import { cents, type Cents } from '../../util/money.js';
import { err, ok, type Result } from '../../util/result.js';

/**
 * The product catalogue as the point of sale sells it. A product is the thing
 * with a price on it. What a guest holds is an entitlement against one of these.
 *
 * Two fields do more work than they look like they do. `liftScope` is what
 * makes a beginner ticket a beginner ticket, and `blackoutClasses` is what makes
 * a cheap season pass cheap. Both are read on every single accepted scan.
 */

export type ProductKind =
  | 'day'
  | 'multi_day'
  | 'season'
  | 'employee'
  | 'comp'
  | 'lesson'
  | 'nordic';

export type AgeBand = 'child' | 'youth' | 'adult' | 'senior' | 'super_senior';

export type LiftScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'listed'; readonly lifts: readonly LiftCode[] };

export interface Product {
  readonly code: string;
  readonly name: string;
  readonly kind: ProductKind;
  readonly ageBand: AgeBand;
  readonly listPrice: Cents;
  /** Days of skiing the product is good for. Zero means unlimited. */
  readonly dayCount: number;
  readonly validFrom: OperatingDate;
  readonly validTo: OperatingDate;
  readonly liftScope: LiftScope;
  /** Day classes this product cannot be used on. */
  readonly blackoutClasses: readonly DayClass[];
  /** Can somebody else use it. Only comps and employee passes usually can not. */
  readonly transferable: boolean;
  /** Number of first scans a day the media may make. Zero means no cap. */
  readonly dailyEntryCap: number;
}

const KINDS: readonly ProductKind[] = [
  'day',
  'multi_day',
  'season',
  'employee',
  'comp',
  'lesson',
  'nordic',
];

const AGE_BANDS: readonly AgeBand[] = ['child', 'youth', 'adult', 'senior', 'super_senior'];

export function isProductKind(value: string): value is ProductKind {
  return (KINDS as readonly string[]).includes(value);
}

export function isAgeBand(value: string): value is AgeBand {
  return (AGE_BANDS as readonly string[]).includes(value);
}

export const ALL_LIFTS_SCOPE: LiftScope = { kind: 'all' };

export function listedScope(lifts: readonly LiftCode[]): LiftScope {
  return { kind: 'listed', lifts: [...lifts].sort() };
}

export function scopeCovers(scope: LiftScope, lift: LiftCode): boolean {
  return scope.kind === 'all' || scope.lifts.includes(lift);
}

export function describeScope(scope: LiftScope): string {
  return scope.kind === 'all' ? 'every lift' : scope.lifts.join(', ');
}

export interface ProductInput {
  readonly code: string;
  readonly name: string;
  readonly kind: string;
  readonly ageBand: string;
  readonly listPriceCents: number;
  readonly dayCount: number;
  readonly validFrom: string;
  readonly validTo: string;
  readonly lifts?: readonly string[] | undefined;
  readonly blackoutClasses?: readonly DayClass[] | undefined;
  readonly transferable?: boolean | undefined;
  readonly dailyEntryCap?: number | undefined;
}

const CODE_PATTERN = /^[A-Z0-9]{3,12}$/;

export function makeProduct(input: ProductInput): Result<Product> {
  const code = input.code.trim().toUpperCase();
  if (!CODE_PATTERN.test(code))
    return err(`product code ${JSON.stringify(input.code)} is not usable`);
  if (input.name.trim() === '') return err(`product ${code} has no name`);
  if (!isProductKind(input.kind)) return err(`product ${code} is a ${input.kind}`);
  if (!isAgeBand(input.ageBand)) return err(`product ${code} is for a ${input.ageBand}`);
  if (!Number.isInteger(input.listPriceCents) || input.listPriceCents < 0) {
    return err(`product ${code} is priced at ${input.listPriceCents}`);
  }
  if (!Number.isInteger(input.dayCount) || input.dayCount < 0) {
    return err(`product ${code} is good for ${input.dayCount} days`);
  }

  const validFrom = parseOperatingDate(input.validFrom);
  if (!validFrom.ok) return validFrom;
  const validTo = parseOperatingDate(input.validTo);
  if (!validTo.ok) return validTo;
  if (validTo.value < validFrom.value) return err(`product ${code} expires before it starts`);

  let liftScope: LiftScope = ALL_LIFTS_SCOPE;
  if (input.lifts !== undefined) {
    if (input.lifts.length === 0) return err(`product ${code} lists no lifts`);
    const lifts: LiftCode[] = [];
    for (const raw of input.lifts) {
      const lift = parseLiftCode(raw);
      if (!lift.ok) return lift;
      lifts.push(lift.value);
    }
    liftScope = listedScope(lifts);
  }

  const dayCount = input.dayCount;
  if (input.kind === 'day' && dayCount !== 1)
    return err(`product ${code} is a day ticket for ${dayCount} days`);
  if (input.kind === 'multi_day' && dayCount < 2) {
    return err(`product ${code} is a multi day ticket for ${dayCount} days`);
  }
  if ((input.kind === 'season' || input.kind === 'employee') && dayCount !== 0) {
    return err(`product ${code} is a season product capped at ${dayCount} days`);
  }

  const cap = input.dailyEntryCap ?? 0;
  if (!Number.isInteger(cap) || cap < 0) return err(`product ${code} caps entries at ${cap}`);

  return ok({
    code,
    name: input.name.trim(),
    kind: input.kind,
    ageBand: input.ageBand,
    listPrice: cents(input.listPriceCents),
    dayCount,
    validFrom: validFrom.value,
    validTo: validTo.value,
    liftScope,
    blackoutClasses: [...(input.blackoutClasses ?? [])].sort(),
    transferable: input.transferable ?? (input.kind !== 'employee' && input.kind !== 'comp'),
    dailyEntryCap: cap,
  });
}

export function isUnlimited(product: Product): boolean {
  return product.dayCount === 0;
}

export function blacksOut(product: Product, dayClass: DayClass): boolean {
  return product.blackoutClasses.includes(dayClass);
}

/** What a day of skiing on this product is nominally worth before use. */
export function nominalDayValue(product: Product, assumedDays: number): Cents {
  const days = isUnlimited(product) ? Math.max(1, assumedDays) : product.dayCount;
  return cents(Math.round(product.listPrice / days));
}

export class ProductCatalogue {
  private readonly byCode = new Map<string, Product>();

  static from(products: readonly Product[]): ProductCatalogue {
    const catalogue = new ProductCatalogue();
    for (const product of products) catalogue.add(product);
    return catalogue;
  }

  add(product: Product): void {
    if (this.byCode.has(product.code)) throw new Error(`product ${product.code} is listed twice`);
    this.byCode.set(product.code, product);
  }

  find(code: string): Product | undefined {
    return this.byCode.get(code.trim().toUpperCase());
  }

  all(): Product[] {
    return [...this.byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  ofKind(kind: ProductKind): Product[] {
    return this.all().filter((product) => product.kind === kind);
  }

  get size(): number {
    return this.byCode.size;
  }
}
