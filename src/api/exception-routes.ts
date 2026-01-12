import type { ExceptionRegister, ExceptionRow } from '../domain/exception/register.js';
import {
  applyOverride,
  scanDateForExceptions,
  type ExceptionScanContext,
} from '../service/exceptions.js';
import { pageBody, paginate, readPageRequest } from './pagination.js';
import { fail } from './problems.js';
import { ok, type Router } from './router.js';
import { overrideBody, readBody, readDate, readPeriod } from './validation.js';

/**
 * The supervisor screen. Read routes are open and the write route is not,
 * because a disposition is somebody putting their name to a decision about a
 * guest and the audit trail is worthless if anybody can write one.
 */

export function toExceptionWire(row: ExceptionRow): Record<string, unknown> {
  return {
    id: row.id,
    kind: row.kind,
    date: row.operatingDate,
    subject: row.subject,
    detail: row.detail,
    evidence: row.evidence,
    severity: row.severity,
    disposition: row.disposition,
    note: row.note,
    decidedBy: row.decidedBy ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

export interface ExceptionRouteContext {
  readonly register: ExceptionRegister;
  readonly scan: ExceptionScanContext;
}

export function addExceptionRoutes(router: Router, context: ExceptionRouteContext): Router {
  router.add({
    method: 'GET',
    path: '/exceptions',
    summary: 'the register, paged, oldest first',
    handler: ({ query }) => {
      const period = readPeriod(query['from'], query['to']);
      if (!period.ok) return period.error;
      const page = readPageRequest(query);
      if (!page.ok) return page.error;
      const rows = context.register
        .all()
        .filter(
          (row) => row.operatingDate >= period.value.from && row.operatingDate <= period.value.to,
        )
        .filter((row) => query['state'] === undefined || row.disposition === query['state']);
      return ok(
        pageBody(
          paginate(rows, page.value, (row) => row.id),
          toExceptionWire,
        ),
      );
    },
  });

  router.add({
    method: 'GET',
    path: '/exceptions/:id',
    summary: 'one finding',
    handler: ({ params }) => {
      const row = context.register.get(params['id'] ?? '');
      if (row === undefined) return fail('no_exception', `no exception ${params['id'] ?? ''}`);
      return ok(toExceptionWire(row));
    },
  });

  router.add({
    method: 'GET',
    path: '/exceptions/open/count',
    summary: 'how much is waiting for a supervisor',
    handler: () => {
      const open = context.register.open();
      return ok({
        open: open.length,
        high: open.filter((row) => row.severity === 'high').length,
        oldest: open[0]?.operatingDate ?? null,
      });
    },
  });

  router.add({
    method: 'POST',
    path: '/exceptions/decide',
    summary: 'record a decision about a finding',
    scope: 'supervise',
    handler: ({ body }) => {
      const parsed = readBody(overrideBody, body);
      if (!parsed.ok) return parsed.error;
      const applied = applyOverride(context.register, parsed.value);
      if (!applied.ok) return fail('no_exception', applied.error);
      return ok({
        exception: applied.value.exceptionId,
        from: applied.value.from,
        to: applied.value.to,
        by: applied.value.by,
        at: applied.value.at.toISOString(),
      });
    },
  });

  router.add({
    method: 'POST',
    path: '/exceptions/scan/:date',
    summary: 'run the fraud rules over one day again',
    scope: 'write',
    handler: ({ params }) => {
      const date = readDate(params['date']);
      if (!date.ok) return date.error;
      const result = scanDateForExceptions(date.value, context.scan);
      return ok(
        {
          date: result.date,
          found: result.found,
          added: result.added,
          kept: result.kept,
          dropped: result.dropped,
          softened: result.softened,
        },
        202,
      );
    },
  });

  return router;
}
