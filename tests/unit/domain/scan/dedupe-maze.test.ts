import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAZE_SECONDS,
  dedupe,
  dedupeByMaze,
  suppressionsByReason,
} from '../../../../src/domain/scan/dedupe.js';
import { normaliseScans } from '../../../../src/domain/scan/normalise.js';
import { CARD_ROW, CARD_TESS } from '../../../support/media.js';
import { clocks, rawScan, terminals } from '../../../support/scans.js';

const norm = () => ({ clocks: clocks(), terminals: terminals() });
const options = () => ({ terminals: terminals() });

interface Spec {
  terminal: string;
  media?: string;
  at: string;
  outcome?: 'accept' | 'reject';
}

function scans(specs: readonly Spec[]) {
  return normaliseScans(
    specs.map((spec, i) =>
      rawScan({
        terminal: spec.terminal,
        media: spec.media ?? CARD_ROW,
        at: spec.at,
        seq: i + 1,
        outcome: spec.outcome ?? 'accept',
        reason: spec.outcome === 'reject' ? 'no entitlement' : '',
      }),
    ),
    norm(),
  );
}

describe('deduping across a maze', () => {
  it('drops a read at the far arm of the same maze', () => {
    const result = dedupeByMaze(
      scans([
        { terminal: 'SUNB.02', at: '2025-01-13T18:00:00Z' },
        { terminal: 'SUNB.03', at: '2025-01-13T18:00:20Z' },
      ]),
      options(),
    );
    expect(result.kept).toHaveLength(1);
    expect(result.suppressed[0]?.reason).toBe('maze_crossover');
    expect(result.suppressed[0]?.gapMs).toBe(20_000);
  });

  it('keeps a read at the same gate, which the first pass owns', () => {
    const result = dedupeByMaze(
      scans([
        { terminal: 'SUNB.02', at: '2025-01-13T18:00:00Z' },
        { terminal: 'SUNB.02', at: '2025-01-13T18:00:03Z' },
      ]),
      options(),
    );
    expect(result.kept).toHaveLength(2);
  });

  it('keeps a read once the maze window has passed', () => {
    const result = dedupeByMaze(
      scans([
        { terminal: 'SUNB.02', at: '2025-01-13T18:00:00Z' },
        { terminal: 'SUNB.03', at: '2025-01-13T18:01:00Z' },
      ]),
      options(),
    );
    expect(result.kept).toHaveLength(2);
    expect(DEFAULT_MAZE_SECONDS).toBe(45);
  });

  it('keeps two mazes apart', () => {
    const result = dedupeByMaze(
      scans([
        { terminal: 'SUNB.02', at: '2025-01-13T18:00:00Z' },
        { terminal: 'MEADW.01', at: '2025-01-13T18:00:10Z' },
      ]),
      options(),
    );
    expect(result.kept).toHaveLength(2);
  });

  it('keeps two cards apart', () => {
    const result = dedupeByMaze(
      scans([
        { terminal: 'SUNB.02', at: '2025-01-13T18:00:00Z', media: CARD_ROW },
        { terminal: 'SUNB.03', at: '2025-01-13T18:00:10Z', media: CARD_TESS },
      ]),
      options(),
    );
    expect(result.kept).toHaveLength(2);
  });

  it('never suppresses a refusal here either', () => {
    const result = dedupeByMaze(
      scans([
        { terminal: 'SUNB.02', at: '2025-01-13T18:00:00Z' },
        { terminal: 'SUNB.03', at: '2025-01-13T18:00:10Z', outcome: 'reject' },
      ]),
      options(),
    );
    expect(result.kept).toHaveLength(2);
  });

  it('takes a narrower maze window when asked', () => {
    const result = dedupeByMaze(
      scans([
        { terminal: 'SUNB.02', at: '2025-01-13T18:00:00Z' },
        { terminal: 'SUNB.03', at: '2025-01-13T18:00:20Z' },
      ]),
      { ...options(), mazeSeconds: 10 },
    );
    expect(result.kept).toHaveLength(2);
  });
});

describe('both passes together', () => {
  it('runs the terminal pass first and the maze pass on what it kept', () => {
    const result = dedupe(
      scans([
        { terminal: 'SUNB.01', at: '2025-01-13T18:00:00Z' },
        { terminal: 'SUNB.01', at: '2025-01-13T18:00:04Z' },
        { terminal: 'SUNB.03', at: '2025-01-13T18:00:20Z' },
      ]),
      options(),
    );
    expect(result.kept).toHaveLength(1);
    expect([...suppressionsByReason(result)]).toEqual([
      ['terminal_debounce', 1],
      ['maze_crossover', 1],
    ]);
  });

  it('puts the suppressions back in time order', () => {
    const result = dedupe(
      scans([
        { terminal: 'SUNB.01', at: '2025-01-13T18:00:00Z' },
        { terminal: 'SUNB.03', at: '2025-01-13T18:00:10Z' },
        { terminal: 'SUNB.01', at: '2025-01-13T18:00:04Z' },
      ]),
      options(),
    );
    const times = result.suppressed.map((entry) => entry.scan.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('leaves a clean day untouched', () => {
    const result = dedupe(
      scans([
        { terminal: 'SUNB.01', at: '2025-01-13T18:00:00Z' },
        { terminal: 'SUNB.01', at: '2025-01-13T18:20:00Z' },
        { terminal: 'RIDGE.01', at: '2025-01-13T18:40:00Z' },
      ]),
      options(),
    );
    expect(result.kept).toHaveLength(3);
    expect(result.suppressed).toEqual([]);
    expect(suppressionsByReason(result).size).toBe(0);
  });
});
