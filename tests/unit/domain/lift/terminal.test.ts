import { describe, expect, it } from 'vitest';
import { LiftRegistry } from '../../../../src/domain/lift/lift.js';
import {
  isGateDirection,
  isTerminalStatus,
  makeTerminal,
  TerminalRegistry,
} from '../../../../src/domain/lift/terminal.js';
import { parseTerminalId } from '../../../../src/util/ids.js';
import { expect as expectOk, isErr } from '../../../../src/util/result.js';
import { ALL_LIFTS } from '../../../support/lifts.js';
import { ALL_TERMINALS, terminalOf } from '../../../support/terminals.js';

const id = (raw: string) => expectOk(parseTerminalId(raw), 'terminal');

describe('building a terminal', () => {
  it('takes the maze from the lift code when none is given', () => {
    expect(terminalOf({ id: 'SUNB.02' }).maze).toBe('SUNB');
  });

  it('keeps an explicit maze so two lifts can share a loading point', () => {
    expect(terminalOf({ id: 'CRPT.01', maze: 'BASE' }).maze).toBe('BASE');
  });

  it('recognises the directions and statuses', () => {
    expect(isGateDirection('download')).toBe(true);
    expect(isGateDirection('sideways')).toBe(false);
    expect(isTerminalStatus('spare')).toBe(true);
    expect(isTerminalStatus('broken')).toBe(false);
  });

  it('refuses a dwell that is negative or absurd', () => {
    expect(isErr(makeTerminal({ ...ALL_TERMINALS[0]!, dwellSeconds: -1 }))).toBe(true);
    expect(isErr(makeTerminal({ ...ALL_TERMINALS[0]!, dwellSeconds: 45 }))).toBe(true);
  });

  it('refuses a bad id, direction, status, model or maze', () => {
    const base = { ...ALL_TERMINALS[0]! };
    expect(isErr(makeTerminal({ ...base, id: 'SUNB' }))).toBe(true);
    expect(isErr(makeTerminal({ ...base, direction: 'sideways' }))).toBe(true);
    expect(isErr(makeTerminal({ ...base, status: 'broken' }))).toBe(true);
    expect(isErr(makeTerminal({ ...base, model: '  ' }))).toBe(true);
    expect(isErr(makeTerminal({ ...base, maze: '  ' }))).toBe(true);
  });
});

describe('the terminal registry', () => {
  const registry = TerminalRegistry.from(ALL_TERMINALS);

  it('finds a terminal and complains about one it has never seen', () => {
    expect(registry.size).toBe(10);
    expect(registry.get(id('BOWL.01')).firmware).toBe('3.22.7');
    expect(registry.find(id('NOPE.01'))).toBeUndefined();
    expect(() => registry.get(id('NOPE.01'))).toThrow('no terminal NOPE.01');
  });

  it('refuses the same gate twice', () => {
    const one = TerminalRegistry.from([terminalOf()]);
    expect(() => one.add(terminalOf())).toThrow('is registered');
  });

  it('groups the gates by lift and by maze', () => {
    expect(registry.onLift('SUNB').map((t) => t.id)).toEqual(['SUNB.01', 'SUNB.02', 'SUNB.03']);
    expect(registry.inMaze('RIDGE')).toHaveLength(3);
    expect(registry.mazes()).toEqual(['BOWL', 'CRPT', 'MEADW', 'POMA', 'RIDGE', 'SUNB']);
  });

  it('leaves the spare gates out of the live list', () => {
    expect(registry.live().some((t) => t.id === 'POMA.01')).toBe(false);
    expect(registry.live()).toHaveLength(9);
  });

  it('takes the widest dwell in the maze as the floor', () => {
    expect(registry.mazeDwellSeconds('SUNB')).toBe(9);
    expect(registry.mazeDwellSeconds('RIDGE')).toBe(4);
    expect(registry.mazeDwellSeconds('NOWHERE')).toBe(0);
  });
});

describe('reconciling the gates against the lifts', () => {
  const lifts = LiftRegistry.from(ALL_LIFTS);

  it('passes a configuration that lines up', () => {
    expect(TerminalRegistry.from(ALL_TERMINALS).reconcile(lifts)).toEqual([]);
  });

  it('catches a gate on a lift that does not exist', () => {
    const registry = TerminalRegistry.from([terminalOf({ id: 'GHOST.01' })]);
    expect(registry.reconcile(lifts)).toEqual([
      'terminal GHOST.01 hangs off GHOST, which is not a lift',
    ]);
  });

  it('catches a live gate on a retired lift', () => {
    const registry = TerminalRegistry.from([terminalOf({ id: 'OLDDB.01' })]);
    expect(registry.reconcile(lifts)).toEqual(['terminal OLDDB.01 is live on retired lift OLDDB']);
  });

  it('catches a download gate on something nobody downloads', () => {
    const registry = TerminalRegistry.from([terminalOf({ id: 'SUNB.04', direction: 'download' })]);
    expect(registry.reconcile(lifts)).toEqual(['terminal SUNB.04 is a download gate on a chair']);
  });

  it('catches a gate number no maze has room for', () => {
    const registry = TerminalRegistry.from([terminalOf({ id: 'SUNB.14' })]);
    expect(registry.reconcile(lifts)).toEqual(['terminal SUNB.14 is gate 14']);
  });
});
