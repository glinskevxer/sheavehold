import { parseOperatingDate } from '../util/clock.js';
import { parseMediaSerial, parseTerminalId } from '../util/ids.js';
import type { NormalisedScan } from '../domain/scan/normalise.js';
import { ingestUpload, type IngestContext } from '../service/ingest.js';
import type { ScanStore, StoredBatch } from '../storage/repository/scans.js';
import { fail } from './problems.js';
import { ok, type Router } from './router.js';

/**
 * Everything about the raw stream. These are the only routes the gate uploader
 * itself calls, and the only ones a person is unlikely to look at, so the wire
 * shape here is plain and the field names match what the terminals send.
 */

export interface ScanWire {
  readonly terminal: string;
  readonly lift: string;
  readonly media: string;
  readonly at: string;
  readonly reportedAt: string;
  readonly correctionMs: number;
  readonly date: string;
  readonly sequence: number;
  readonly outcome: string;
  readonly weakRead: boolean;
}

export function toScanWire(scan: NormalisedScan): ScanWire {
  return {
    terminal: scan.terminalId,
    lift: scan.lift,
    media: scan.mediaSerial,
    at: scan.at.toISOString(),
    reportedAt: scan.reportedAt.toISOString(),
    correctionMs: scan.correctionMs,
    date: scan.operatingDate,
    sequence: scan.sequence,
    outcome: scan.outcome,
    weakRead: scan.weakRead,
  };
}

export function toBatchWire(batch: StoredBatch): Record<string, unknown> {
  return {
    batch: batch.batchId,
    terminal: batch.terminalId,
    uploaded: batch.uploadedAt,
    received: batch.receivedAt,
    rows: batch.rowCount,
    accepted: batch.accepted,
    first: batch.firstSequence,
    last: batch.lastSequence,
  };
}

export interface ScanRouteContext {
  readonly scans: ScanStore;
  readonly ingest: IngestContext;
}

export function addScanRoutes(router: Router, context: ScanRouteContext): Router {
  router.add({
    method: 'GET',
    path: '/scans/day/:date',
    summary: 'every scan on one operating day',
    handler: ({ params }) => {
      const date = parseOperatingDate(params['date'] ?? '');
      if (!date.ok) return fail('bad_date', date.error);
      return ok({ date: date.value, scans: context.scans.onDate(date.value).map(toScanWire) });
    },
  });

  router.add({
    method: 'GET',
    path: '/scans/media/:serial',
    summary: 'every scan a card has ever made',
    handler: ({ params }) => {
      const serial = parseMediaSerial(params['serial'] ?? '');
      if (!serial.ok) return fail('bad_media', serial.error);
      return ok({
        media: serial.value,
        scans: context.scans.ofMedia(serial.value).map(toScanWire),
      });
    },
  });

  router.add({
    method: 'GET',
    path: '/scans/terminal/:terminal',
    summary: 'every scan one gate has sent',
    handler: ({ params }) => {
      const terminal = parseTerminalId(params['terminal'] ?? '');
      if (!terminal.ok) return fail('bad_terminal', terminal.error);
      return ok({
        terminal: terminal.value,
        scans: context.scans.onTerminal(terminal.value).map(toScanWire),
      });
    },
  });

  router.add({
    method: 'GET',
    path: '/batches',
    summary: 'every upload the base station has taken',
    handler: () => ok({ batches: context.scans.batches.all().map(toBatchWire) }),
  });

  router.add({
    method: 'GET',
    path: '/batches/:batch',
    summary: 'one upload',
    handler: ({ params }) => {
      const batch = context.scans.batches.get(params['batch'] ?? '');
      if (batch === undefined) return fail('no_batch', `no batch ${params['batch'] ?? ''}`);
      return ok(toBatchWire(batch));
    },
  });

  router.add({
    method: 'POST',
    path: '/batches',
    summary: 'take an upload in',
    scope: 'ingest',
    handler: ({ body }) => {
      if (typeof body !== 'string' || body.trim() === '') {
        return fail('empty_upload', 'the body must be the upload file');
      }
      const receipt = ingestUpload(body, context.ingest);
      if (!receipt.ok) return fail('unreadable_upload', receipt.error);
      return ok(
        {
          batch: receipt.value.batchId,
          accepted: receipt.value.accepted,
          rowsRead: receipt.value.rowsRead,
          rowsStored: receipt.value.rowsStored,
          rowsReplaced: receipt.value.rowsReplaced,
          datesTouched: receipt.value.datesTouched,
          complaints: receipt.value.diagnostics.format(),
        },
        receipt.value.accepted ? 201 : 202,
      );
    },
  });

  return router;
}
