/**
 * Registers every simulator-visible strategy beyond Easy and Normal. Imported for its side
 * effects by tasks.ts and the CLI, so worker threads see the same set.
 */
import { HARD_DEFAULTS, HardBot, type HardOptions } from '@mam/bots';
import { OracleBot } from './oracle';
import { registerStrategy } from './strategies';

/**
 * Options from a spec like "hard:worlds=20,searchBid=0,playUtility=equity", converted to the
 * type of each default.
 */
export function parseOptions<T extends object>(
  defaults: T,
  o: Readonly<Record<string, string>>,
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(o)) {
    if (!(k in defaults)) throw new Error(`unknown option "${k}"`);
    const d = (defaults as Record<string, unknown>)[k];
    if (typeof d === 'number') out[k] = Number(raw);
    else if (typeof d === 'boolean') out[k] = raw === '1' || raw === 'true';
    else out[k] = raw;
  }
  return out as Partial<T>;
}

registerStrategy('hard', (o) => new HardBot(parseOptions<HardOptions>(HARD_DEFAULTS, o)));
registerStrategy('oracle', (o) => new OracleBot(Number(o.exact ?? 7), Number(o.depth ?? 3)));
