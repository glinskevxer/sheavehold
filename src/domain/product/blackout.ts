import { operatingDateRange, operatingDaysBetween, type OperatingDate } from '../../util/clock.js';
import { err, ok, type Result } from '../../util/result.js';
import type { DayClass } from '../calendar/season.js';
import type { Product } from './product.js';

/**
 * Day class blackouts live on the product, because they never change once the
 * pass is printed. Dated blackouts do not: marketing adds one in November when
 * the Christmas booking looks strong, and a handful of passes bought before the
 * change get written into an exemption list rather than refunded.
 *
 * So this is a second, later blackout layer, and the two are checked in a fixed
 * order. The product one first, because it is what the pass was sold under.
 */

export interface BlackoutWindow {
  readonly id: string;
  readonly label: string;
  readonly from: OperatingDate;
  readonly to: OperatingDate;
  /** Product codes the window bites on. Empty means every product. */
  readonly productCodes: readonly string[];
  /** Day classes inside the window that are still allowed. */
  readonly exceptClasses: readonly DayClass[];
  /** Entitlement ids sold before the window was announced. */
  readonly exemptEntitlements: readonly string[];
  readonly announcedAt: Date;
}

export interface BlackoutInput {
  readonly id: string;
  readonly label: string;
  readonly from: OperatingDate;
  readonly to: OperatingDate;
  readonly productCodes?: readonly string[] | undefined;
  readonly exceptClasses?: readonly DayClass[] | undefined;
  readonly exemptEntitlements?: readonly string[] | undefined;
  readonly announcedAt: Date;
}

export function makeBlackout(input: BlackoutInput): Result<BlackoutWindow> {
  if (input.id.trim() === '') return err('a blackout window needs an id');
  if (input.label.trim() === '') return err(`blackout ${input.id} has no label`);
  if (operatingDaysBetween(input.from, input.to) < 0) {
    return err(`blackout ${input.id} ends before it starts`);
  }
  if (Number.isNaN(input.announcedAt.getTime())) {
    return err(`blackout ${input.id} has no announcement date`);
  }
  return ok({
    id: input.id.trim(),
    label: input.label.trim(),
    from: input.from,
    to: input.to,
    productCodes: [...(input.productCodes ?? [])].map((code) => code.toUpperCase()).sort(),
    exceptClasses: [...(input.exceptClasses ?? [])].sort(),
    exemptEntitlements: [...(input.exemptEntitlements ?? [])].sort(),
    announcedAt: input.announcedAt,
  });
}

export function windowCovers(window: BlackoutWindow, date: OperatingDate): boolean {
  return operatingDaysBetween(window.from, date) >= 0 && operatingDaysBetween(date, window.to) >= 0;
}

export function windowDates(window: BlackoutWindow): OperatingDate[] {
  return operatingDateRange(window.from, window.to);
}

export interface BlackoutQuery {
  readonly product: Product;
  readonly entitlementId: string;
  readonly date: OperatingDate;
  readonly dayClass: DayClass;
  /** When the entitlement was sold. A pass bought first is exempt. */
  readonly purchasedAt: Date;
}

export interface BlackoutHit {
  readonly windowId: string;
  readonly label: string;
}

export class BlackoutRegistry {
  private readonly windows: BlackoutWindow[] = [];

  static from(windows: readonly BlackoutWindow[]): BlackoutRegistry {
    const registry = new BlackoutRegistry();
    for (const window of windows) registry.add(window);
    return registry;
  }

  add(window: BlackoutWindow): void {
    if (this.windows.some((existing) => existing.id === window.id)) {
      throw new Error(`blackout ${window.id} is listed twice`);
    }
    this.windows.push(window);
    this.windows.sort((a, b) => a.from.localeCompare(b.from) || a.id.localeCompare(b.id));
  }

  all(): readonly BlackoutWindow[] {
    return this.windows;
  }

  get size(): number {
    return this.windows.length;
  }

  /**
   * The first window that bites, or nothing. A pass bought before the window
   * was announced rides through it, which is the rule the ticket office
   * promised and the one nobody remembers when the exception list is short.
   */
  check(query: BlackoutQuery): BlackoutHit | undefined {
    for (const window of this.windows) {
      if (!windowCovers(window, query.date)) continue;
      if (window.productCodes.length > 0 && !window.productCodes.includes(query.product.code)) {
        continue;
      }
      if (window.exceptClasses.includes(query.dayClass)) continue;
      if (window.exemptEntitlements.includes(query.entitlementId)) continue;
      if (query.purchasedAt.getTime() < window.announcedAt.getTime()) continue;
      return { windowId: window.id, label: window.label };
    }
    return undefined;
  }

  /** Every date in the season this product cannot ride, for the rate card. */
  blackedOutDates(
    productCode: string,
    dayClassOf: (date: OperatingDate) => DayClass,
  ): OperatingDate[] {
    const dates = new Set<string>();
    for (const window of this.windows) {
      if (
        window.productCodes.length > 0 &&
        !window.productCodes.includes(productCode.toUpperCase())
      ) {
        continue;
      }
      for (const date of windowDates(window)) {
        if (window.exceptClasses.includes(dayClassOf(date))) continue;
        dates.add(date);
      }
    }
    return [...dates].sort() as OperatingDate[];
  }

  windowsFor(date: OperatingDate): BlackoutWindow[] {
    return this.windows.filter((window) => windowCovers(window, date));
  }
}
