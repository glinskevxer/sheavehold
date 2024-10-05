import {
  gateOfTerminal,
  liftOfTerminal,
  parseTerminalId,
  type TerminalId,
} from '../../util/ids.js';
import { err, ok, type Result } from '../../util/result.js';
import { SheaveholdError } from '../../util/diagnostic.js';
import type { LiftRegistry } from './lift.js';

/**
 * A terminal is one RFID reader on one gate arm. Gates that feed the same
 * loading point share a maze, and that matters: two reads on two gates of the
 * same maze inside a few seconds is one person walking through the wrong lane,
 * not two rides. The dedupe rules read the maze, never the gate.
 */

export type GateDirection = 'uphill' | 'download';

export type TerminalStatus = 'live' | 'spare' | 'removed';

export interface Terminal {
  readonly id: TerminalId;
  /** Gates on the same loading point share this. Usually the lift code. */
  readonly maze: string;
  readonly direction: GateDirection;
  /** Reader model, which decides how long a tag lingers in the field. */
  readonly model: string;
  readonly firmware: string;
  /** Seconds a tag stays readable after the guest has walked through. */
  readonly dwellSeconds: number;
  readonly status: TerminalStatus;
  readonly installedSeason: number;
}

const DIRECTIONS: readonly GateDirection[] = ['uphill', 'download'];
const STATUSES: readonly TerminalStatus[] = ['live', 'spare', 'removed'];

export function isGateDirection(value: string): value is GateDirection {
  return (DIRECTIONS as readonly string[]).includes(value);
}

export function isTerminalStatus(value: string): value is TerminalStatus {
  return (STATUSES as readonly string[]).includes(value);
}

export interface TerminalInput {
  readonly id: string;
  readonly maze?: string;
  readonly direction: string;
  readonly model: string;
  readonly firmware: string;
  readonly dwellSeconds: number;
  readonly status: string;
  readonly installedSeason: number;
}

export function makeTerminal(input: TerminalInput): Result<Terminal> {
  const id = parseTerminalId(input.id);
  if (!id.ok) return id;
  if (!isGateDirection(input.direction)) {
    return err(`terminal ${input.id} faces ${input.direction}`);
  }
  if (!isTerminalStatus(input.status)) {
    return err(`terminal ${input.id} is ${input.status}`);
  }
  if (input.model.trim() === '') return err(`terminal ${input.id} has no model`);
  if (!Number.isFinite(input.dwellSeconds) || input.dwellSeconds < 0) {
    return err(`terminal ${input.id} has a dwell of ${input.dwellSeconds}`);
  }
  if (input.dwellSeconds > 30) {
    return err(`terminal ${input.id} claims a dwell of ${input.dwellSeconds} seconds`);
  }
  const maze = (input.maze ?? liftOfTerminal(id.value)).trim();
  if (maze === '') return err(`terminal ${input.id} has an empty maze`);
  return ok({
    id: id.value,
    maze,
    direction: input.direction,
    model: input.model.trim(),
    firmware: input.firmware.trim(),
    dwellSeconds: input.dwellSeconds,
    status: input.status,
    installedSeason: input.installedSeason,
  });
}

export class TerminalRegistry {
  private readonly byId = new Map<string, Terminal>();

  static from(terminals: readonly Terminal[]): TerminalRegistry {
    const registry = new TerminalRegistry();
    for (const terminal of terminals) registry.add(terminal);
    return registry;
  }

  add(terminal: Terminal): void {
    if (this.byId.has(terminal.id)) {
      throw new SheaveholdError('terminal.duplicate', `terminal ${terminal.id} is registered`, {
        terminal: terminal.id,
      });
    }
    this.byId.set(terminal.id, terminal);
  }

  find(id: TerminalId): Terminal | undefined {
    return this.byId.get(id);
  }

  get(id: TerminalId): Terminal {
    const terminal = this.byId.get(id);
    if (terminal === undefined) {
      throw new SheaveholdError('terminal.unknown', `no terminal ${id}`, { terminal: id });
    }
    return terminal;
  }

  has(id: TerminalId): boolean {
    return this.byId.has(id);
  }

  get size(): number {
    return this.byId.size;
  }

  all(): Terminal[] {
    return [...this.byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  live(): Terminal[] {
    return this.all().filter((terminal) => terminal.status === 'live');
  }

  onLift(lift: string): Terminal[] {
    return this.all().filter((terminal) => liftOfTerminal(terminal.id) === lift);
  }

  inMaze(maze: string): Terminal[] {
    return this.all().filter((terminal) => terminal.maze === maze);
  }

  mazes(): string[] {
    return [...new Set(this.all().map((terminal) => terminal.maze))].sort();
  }

  /** Widest dwell in a maze, which is the floor the dedupe window sits on. */
  mazeDwellSeconds(maze: string): number {
    return this.inMaze(maze).reduce(
      (widest, terminal) => Math.max(widest, terminal.dwellSeconds),
      0,
    );
  }

  /**
   * Every live terminal has to hang off a lift we know about, and a download
   * gate only makes sense on a lift people are allowed to ride down.
   */
  reconcile(lifts: LiftRegistry): string[] {
    const problems: string[] = [];
    for (const terminal of this.all()) {
      const code = liftOfTerminal(terminal.id);
      const lift = lifts.find(code);
      if (lift === undefined) {
        problems.push(`terminal ${terminal.id} hangs off ${code}, which is not a lift`);
        continue;
      }
      if (terminal.status === 'live' && lift.status === 'retired') {
        problems.push(`terminal ${terminal.id} is live on retired lift ${code}`);
      }
      if (terminal.direction === 'download' && lift.kind !== 'gondola' && lift.kind !== 'tram') {
        problems.push(`terminal ${terminal.id} is a download gate on a ${lift.kind}`);
      }
      if (gateOfTerminal(terminal.id) > 12) {
        problems.push(`terminal ${terminal.id} is gate ${gateOfTerminal(terminal.id)}`);
      }
    }
    return problems;
  }
}
