import { groupBy, sumBy } from '../util/collect.js';
import { DiagnosticBag } from '../util/diagnostic.js';
import type { ReferenceStore } from './repository/reference.js';
import type { RideStore } from './repository/rides.js';
import { scanKeyOf, type ScanStore } from './repository/scans.js';

/**
 * What `sheavehold doctor` runs. Every check here exists because something in
 * it was once wrong on a live store and nothing noticed until a report came out
 * with a number somebody could not explain.
 *
 * Checks are cheap and read only. None of them repair anything, because a
 * repair that runs unattended on a store nobody has looked at is how a bad day
 * becomes a bad week.
 */

export interface IntegrityReport {
  readonly checked: number;
  readonly diagnostics: DiagnosticBag;
  readonly healthy: boolean;
}

export interface IntegrityInput {
  readonly reference: ReferenceStore;
  readonly scans: ScanStore;
  readonly rides: RideStore;
}

export function checkIntegrity(input: IntegrityInput): IntegrityReport {
  const diagnostics = new DiagnosticBag();
  let checked = 0;

  for (const problem of input.reference.danglingReferences()) {
    diagnostics.error('integrity.dangling_reference', problem);
  }
  checked += 1;

  checked += 1;
  for (const ride of input.rides.rides.all()) {
    const key = `${ride.terminalId}#${String(ride.sequence).padStart(9, '0')}`;
    if (input.scans.scans.has(key)) continue;
    diagnostics.error('integrity.ride_without_scan', `ride ${ride.id} has no scan behind it`, {
      ride: ride.id,
    });
  }

  checked += 1;
  for (const visit of input.rides.visits.all()) {
    const own = input.rides.rides
      .by('guest_day', `${visit.guestId}#${visit.operatingDate}`)
      .filter((ride) => ride.entitlementId === visit.entitlementId);
    if (own.length !== visit.rideCount) {
      diagnostics.error(
        'integrity.visit_ride_count',
        `visit ${visit.id} says ${visit.rideCount} rides and ${own.length} are on file`,
        { visit: visit.id, claimed: visit.rideCount, found: own.length },
      );
      continue;
    }
    const vertical = sumBy(own, (ride) => ride.verticalFt);
    if (vertical !== visit.verticalFt) {
      diagnostics.error(
        'integrity.visit_vertical',
        `visit ${visit.id} says ${visit.verticalFt} feet and its rides add to ${vertical}`,
        { visit: visit.id },
      );
    }
  }

  checked += 1;
  for (const [date, rides] of groupBy(input.rides.rides.all(), (ride) => ride.operatingDate)) {
    const scans = input.scans.countOnDate(date);
    if (scans === 0 && rides.length > 0) {
      diagnostics.error(
        'integrity.rides_without_scans',
        `${date} has ${rides.length} rides and no scans at all`,
        { date },
      );
    }
  }

  checked += 1;
  for (const scan of input.scans.scans.all()) {
    if (input.scans.scans.get(scanKeyOf(scan)) === scan) continue;
    diagnostics.error('integrity.scan_key', `a scan on ${scan.terminalId} is under the wrong key`, {
      terminal: scan.terminalId,
    });
  }

  checked += 1;
  for (const ride of input.rides.rides.all()) {
    if (input.reference.entitlements.has(ride.entitlementId)) continue;
    diagnostics.warn(
      'integrity.ride_entitlement',
      `ride ${ride.id} names entitlement ${ride.entitlementId}, which is not on file`,
      { ride: ride.id },
    );
  }

  checked += 1;
  for (const batch of input.scans.refusedBatches()) {
    diagnostics.warn('integrity.refused_batch', `batch ${batch.batchId} was never taken in`, {
      batch: batch.batchId,
    });
  }

  return { checked, diagnostics, healthy: !diagnostics.hasErrors() };
}

export function summariseIntegrity(report: IntegrityReport): string[] {
  const lines = [
    `${report.checked} checks run`,
    `${report.diagnostics.bySeverity('error').length} problems`,
    `${report.diagnostics.bySeverity('warning').length} things worth a look`,
  ];
  if (report.healthy) lines.push('the store is consistent');
  return lines;
}
