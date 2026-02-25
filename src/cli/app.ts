import type { Stores } from '../service/stores.js';

/**
 * Everything a command needs, handed in rather than built inside. The stores
 * come from the service layer so the router and the command line cannot drift
 * apart; the three io functions are here because only the command line has
 * them.
 */
export interface CliApp extends Stores {
  readonly readFile: (path: string) => string;
  readonly writeFile: (path: string, text: string) => void;
}
