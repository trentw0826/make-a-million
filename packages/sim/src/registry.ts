/**
 * Registers every simulator-visible strategy beyond Easy and Normal. Imported for its side
 * effects by tasks.ts and the CLI, so worker threads see the same set.
 */
import { EXPERT_DEFAULTS, HARD_DEFAULTS, HardBot, type HardOptions } from '@mam/bots';
import { HindsightBot, type HindsightKind } from './hindsight';
import { OracleBot, PEEK_GROUPS, PeekBot, type PeekGroup } from './oracle';
import { RolloutBot } from './rollout';
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

/**
 * Expert-0: Expert as first fitted to its 5 s reply time (4.8 s deadline), frozen so that
 * later changes to EXPERT_DEFAULTS can be measured against it (docs/bot-ladder.md).
 */
export const EXPERT0: HardOptions = {
  ...HARD_DEFAULTS,
  worlds: 60,
  nodes: 8_000_000,
  depth: 2,
  exactTricks: 7,
  worldNodes: 1_200_000,
  bidWorlds: 400,
  screenWorlds: 80,
  refineWorlds: 24,
  refineTop: 5,
  refineDepth: 2,
  refineNodes: 24_000_000,
};

/** Defaults a Hard-family spec can start from ("base=expert0"). */
const BASES: Readonly<Record<string, HardOptions>> = {
  hard: HARD_DEFAULTS,
  expert: EXPERT_DEFAULTS,
  expert0: EXPERT0,
};

/** A Hard-family bot from `base` (default Hard) plus the spec's overrides. */
function hardFamily(base: string | undefined, o: Readonly<Record<string, string>>): HardBot {
  const defaults = BASES[base ?? 'hard'];
  if (!defaults) throw new Error(`unknown base "${base}"`);
  return new HardBot({ ...defaults, ...parseOptions<HardOptions>(defaults, o) });
}

registerStrategy('hard', (o) => hardFamily('hard', o));
registerStrategy('expert', (o) => hardFamily('expert', o));
registerStrategy('expert0', (o) => hardFamily('expert0', o));
registerStrategy('oracle', (o) => new OracleBot(Number(o.exact ?? 7), Number(o.depth ?? 3)));
/**
 * Diagnostic: a Hard-family bot (`base`, default Hard), except that card play with `last`
 * or fewer tricks left is by the all-seeing oracle. "hybrid:last=4" vs "hard" measures what
 * Hard loses in the last 4 tricks.
 */
registerStrategy('hybrid', (o) => {
  const { last, exact, depth, base, ...rest } = o;
  return new OracleBot(
    Number(exact ?? 7),
    Number(depth ?? 3),
    hardFamily(base, rest),
    Number(last ?? 13),
  );
});

/**
 * Diagnostic: a Hard-family bot (`base`, default Hard) whose sampled worlds put the cards
 * of the named groups (PEEK_GROUPS, joined by "+") where they really are, in card play with
 * `last` or fewer tricks left. "peek:cards=bull+bear+tiger" vs "hard" is the most that
 * inferring where the specials are could gain; "peek:cards=all" plays the true deal.
 */
registerStrategy('peek', (o) => {
  const { cards = 'bull+bear+tiger', last, base, ...rest } = o;
  const groups = cards.split('+').map((name) => {
    if (!(PEEK_GROUPS as readonly string[]).includes(name)) {
      throw new Error(`unknown peek group "${name}"`);
    }
    return name as PeekGroup;
  });
  return new PeekBot(groups, hardFamily(base, rest), Number(last ?? 13));
});

/**
 * Diagnostic: a Hard-family bot (`base`, default Hard) whose contract decisions of the named
 * kinds ("kinds=bid+discard+trump") are made in hindsight, by playing out each candidate
 * with the table's bots (hindsight.ts). Its margin over its base bounds what better
 * decisions of those kinds could gain. `top`: discards tried (default 6).
 */
registerStrategy('hindsight', (o) => {
  const { kinds = 'bid+discard+trump', top, base, ...rest } = o;
  const set = new Set(
    kinds.split('+').map((k) => {
      if (k !== 'bid' && k !== 'discard' && k !== 'trump') {
        throw new Error(`unknown hindsight kind "${k}"`);
      }
      return k as HindsightKind;
    }),
  );
  return new HindsightBot(set, hardFamily(base, rest), Number(top ?? 6));
});

/**
 * Diagnostic for PIMC's own flaws: a Hard-family bot (`base`) that, with `last` (default 3)
 * or fewer tricks left, values each card by playing the hand out with its base in all four
 * seats over `worlds` (default 16) sampled worlds (rollout.ts).
 */
registerStrategy('rollout', (o) => {
  const { last, worlds, base, ...rest } = o;
  return new RolloutBot(hardFamily(base, rest), Number(last ?? 3), Number(worlds ?? 16));
});
