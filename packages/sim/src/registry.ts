/**
 * Registers every simulator-visible strategy beyond Easy and Normal. Imported for its side
 * effects by tasks.ts and the CLI, so worker threads see the same set.
 */
import { EXPERT_DEFAULTS, HARD_DEFAULTS, HardBot, type HardOptions } from '@mam/bots';
import { OracleBot, PeekBot } from './oracle';
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
registerStrategy(
  'expert',
  (o) => new HardBot({ ...EXPERT_DEFAULTS, ...parseOptions<HardOptions>(EXPERT_DEFAULTS, o) }),
);
registerStrategy('oracle', (o) => new OracleBot(Number(o.exact ?? 7), Number(o.depth ?? 3)));
/**
 * Diagnostic: Hard, except that card play with `last` or fewer tricks left is by the
 * all-seeing oracle. "hybrid:last=4" vs "hard" measures what Hard loses in the last 4 tricks.
 */
registerStrategy('hybrid', (o) => {
  const { last, exact, depth, ...hard } = o;
  return new OracleBot(
    Number(exact ?? 7),
    Number(depth ?? 3),
    new HardBot(parseOptions<HardOptions>(HARD_DEFAULTS, hard)),
    Number(last ?? 13),
  );
});

/** Cards a "peek" spec can reveal, by name ("cards=bull+bear+tiger"). */
const PEEK_CARDS: Readonly<Record<string, number>> = { tiger: 52, bull: 53, bear: 54 };

/**
 * Diagnostic: Hard whose sampled worlds must put the named cards where they really are, in
 * card play with `last` or fewer tricks left. "peek:cards=bull+bear+tiger" vs "hard" is the
 * most that inferring where the specials are could gain.
 */
registerStrategy('peek', (o) => {
  const { cards = 'bull+bear+tiger', last, pool, ...hard } = o;
  const ids = cards.split('+').map((name) => {
    const id = PEEK_CARDS[name];
    if (id === undefined) throw new Error(`unknown peek card "${name}"`);
    return id;
  });
  return new PeekBot(
    ids,
    new HardBot(parseOptions<HardOptions>(HARD_DEFAULTS, hard)),
    Number(last ?? 13),
    Number(pool ?? 40),
  );
});
