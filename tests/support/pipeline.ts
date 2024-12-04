import { LiftRegistry } from '../../src/domain/lift/lift.js';
import { admitScans } from '../../src/domain/scan/admission.js';
import { authoriseScans, DayUseLedger } from '../../src/domain/scan/authorise.js';
import { dedupe } from '../../src/domain/scan/dedupe.js';
import { normaliseScans } from '../../src/domain/scan/normalise.js';
import type { RawScanRow } from '../../src/domain/scan/scan.js';
import { buildRides, type Ride } from '../../src/domain/ride/ride.js';
import { blackouts, catalogue, entitlementMap } from './entitlements.js';
import { ALL_LIFTS } from './lifts.js';
import { bindings, CARD_ROW, mediaMap } from './media.js';
import { calendar2024 } from './season.js';
import { clocks, rawScan, terminals } from './scans.js';

export interface ScanSpec {
  readonly terminal?: string;
  readonly media?: string;
  readonly at: string;
  readonly outcome?: 'accept' | 'reject';
  readonly seq?: number;
}

export function rawFrom(specs: readonly ScanSpec[]): RawScanRow[] {
  return specs.map((spec, i) => ({
    terminal: spec.terminal ?? 'SUNB.01',
    media: spec.media ?? CARD_ROW,
    at: spec.at,
    seq: spec.seq ?? i + 1,
    outcome: spec.outcome ?? 'accept',
    reason: spec.outcome === 'reject' ? 'no entitlement' : '',
    rssi: -52,
    antenna: 1,
  }));
}

export function lifts(): LiftRegistry {
  return LiftRegistry.from(ALL_LIFTS);
}

/** Everything from a raw row to a ride, which is what the service does. */
export function ridesFrom(specs: readonly ScanSpec[], ledger = new DayUseLedger()): Ride[] {
  const scans = rawFrom(specs).map((row) => rawScan(row));
  const normalised = normaliseScans(scans, { clocks: clocks(), terminals: terminals() });
  const deduped = dedupe(normalised, { terminals: terminals() });
  const admissions = admitScans(deduped.kept, {
    terminals: terminals(),
    bindings: bindings(),
    media: mediaMap(),
  });
  const authorisations = authoriseScans(admissions, {
    entitlements: entitlementMap(),
    products: catalogue(),
    calendar: calendar2024(),
    blackouts: blackouts(),
    ledger,
  });
  return buildRides(authorisations, { lifts: lifts() });
}
