import { ingestUpload } from '../../src/service/ingest.js';
import type { RecomputeContext } from '../../src/service/recompute.js';
import { RideStore } from '../../src/storage/repository/rides.js';
import { expect as expectOk } from '../../src/util/result.js';
import { blackouts, catalogue } from './entitlements.js';
import { lifts, type ScanSpec } from './pipeline.js';
import { referenceStore } from './store.js';
import { terminals } from './scans.js';
import { calendar2024 } from './season.js';
import { ingestContext, uploadFile, type UploadOptions } from './uploads.js';

export interface Harness extends RecomputeContext {
  ingest: (specs: readonly ScanSpec[], options?: UploadOptions) => void;
}

/** A whole working system, wired the way the cli wires it. */
export function harness(): Harness {
  const context = ingestContext();
  const base: RecomputeContext = {
    reference: referenceStore(),
    scans: context.scans,
    rides: new RideStore(),
    terminals: terminals(),
    lifts: lifts(),
    products: catalogue(),
    calendar: calendar2024(),
    blackouts: blackouts(),
  };
  return {
    ...base,
    ingest(specs, options) {
      expectOk(ingestUpload(uploadFile(specs, options), context), 'ingest');
    },
  };
}
