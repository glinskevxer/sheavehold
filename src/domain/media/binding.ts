import type { MediaSerial } from '../../util/ids.js';
import { err, ok, type Result } from '../../util/result.js';
import { SheaveholdError } from '../../util/diagnostic.js';

/**
 * A binding ties one serial to one entitlement for one stretch of time. The
 * interval is half open, `from` inclusive and `until` exclusive, so a card
 * handed back at 16:00 and reissued at 16:00 resolves to exactly one holder at
 * every instant. Getting that wrong shows up as a pass-back exception on the
 * first ride after the handover, which is how we found it.
 */

export interface Binding {
  readonly serial: MediaSerial;
  /** The entitlement this media carries, issued by the point of sale. */
  readonly entitlementId: string;
  /** The person the entitlement belongs to. */
  readonly guestId: string;
  readonly from: Date;
  readonly until: Date | undefined;
  readonly reason: string;
}

export interface BindingInput {
  readonly serial: MediaSerial;
  readonly entitlementId: string;
  readonly guestId: string;
  readonly from: Date;
  readonly until?: Date | undefined;
  readonly reason?: string | undefined;
}

export function makeBinding(input: BindingInput): Result<Binding> {
  if (input.entitlementId.trim() === '') return err('a binding needs an entitlement');
  if (input.guestId.trim() === '') return err('a binding needs a guest');
  if (Number.isNaN(input.from.getTime())) return err('a binding needs a start');
  if (input.until !== undefined) {
    if (Number.isNaN(input.until.getTime())) return err('a binding end is not a date');
    if (input.until.getTime() <= input.from.getTime()) {
      return err(`binding for ${input.serial} ends at or before it starts`);
    }
  }
  return ok({
    serial: input.serial,
    entitlementId: input.entitlementId.trim(),
    guestId: input.guestId.trim(),
    from: input.from,
    until: input.until,
    reason: input.reason?.trim() ?? 'issued',
  });
}

export function bindingCovers(binding: Binding, at: Date): boolean {
  if (at.getTime() < binding.from.getTime()) return false;
  if (binding.until === undefined) return true;
  return at.getTime() < binding.until.getTime();
}

export function bindingsOverlap(left: Binding, right: Binding): boolean {
  const leftEnd = left.until?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightEnd = right.until?.getTime() ?? Number.POSITIVE_INFINITY;
  return left.from.getTime() < rightEnd && right.from.getTime() < leftEnd;
}

/**
 * The whole binding history, indexed by serial. Kept sorted by start so a
 * resolve is a walk backwards rather than a scan of the season.
 */
export class BindingLedger {
  private readonly bySerial = new Map<string, Binding[]>();

  static from(bindings: readonly Binding[]): BindingLedger {
    const ledger = new BindingLedger();
    for (const binding of bindings) ledger.add(binding);
    return ledger;
  }

  add(binding: Binding): void {
    const existing = this.bySerial.get(binding.serial) ?? [];
    for (const other of existing) {
      if (bindingsOverlap(binding, other)) {
        throw new SheaveholdError(
          'binding.overlap',
          `media ${binding.serial} is bound twice over the same hours`,
          { serial: binding.serial, entitlement: binding.entitlementId },
        );
      }
    }
    existing.push(binding);
    existing.sort((a, b) => a.from.getTime() - b.from.getTime());
    this.bySerial.set(binding.serial, existing);
  }

  /** Close an open binding so the media can go out again. */
  release(serial: MediaSerial, at: Date, reason = 'returned'): Result<Binding> {
    const history = this.bySerial.get(serial);
    const open = history?.find((binding) => binding.until === undefined);
    if (history === undefined || open === undefined) {
      return err(`media ${serial} has no open binding to release`);
    }
    if (at.getTime() <= open.from.getTime()) {
      return err(`media ${serial} cannot be released before it was issued`);
    }
    const closed: Binding = { ...open, until: at, reason };
    history[history.indexOf(open)] = closed;
    return ok(closed);
  }

  resolve(serial: MediaSerial, at: Date): Binding | undefined {
    return this.bySerial.get(serial)?.findLast((binding) => bindingCovers(binding, at));
  }

  history(serial: MediaSerial): readonly Binding[] {
    return this.bySerial.get(serial) ?? [];
  }

  serials(): MediaSerial[] {
    return [...this.bySerial.keys()].sort() as MediaSerial[];
  }

  /** Every serial the entitlement has ever been carried on, in issue order. */
  serialsFor(entitlementId: string): MediaSerial[] {
    const out: { serial: MediaSerial; from: number }[] = [];
    for (const history of this.bySerial.values()) {
      for (const binding of history) {
        if (binding.entitlementId === entitlementId) {
          out.push({ serial: binding.serial, from: binding.from.getTime() });
        }
      }
    }
    out.sort((a, b) => a.from - b.from);
    return [...new Set(out.map((entry) => entry.serial))];
  }

  get size(): number {
    return this.bySerial.size;
  }
}
