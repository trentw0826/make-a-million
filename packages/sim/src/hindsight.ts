import { type BotStrategy, discardCandidates, type HardBot, playoutWith } from '@mam/bots';
import {
  type Action,
  applyActionOrThrow,
  type CardId,
  type GameState,
  type Observation,
  type Rng,
  type Seat,
  SUITS,
  teamOf,
} from '@mam/engine';
import { ME_TABLE } from '@mam/search';
import { equityAfter } from './duplicate';
import { decisionRng, nextActor } from './runner';
import { isOracle, type OracleContext, type OracleStrategy, type SimStrategy } from './strategies';

/** Contract decisions a hindsight oracle can take over. */
export type HindsightKind = 'bid' | 'discard' | 'trump';

/**
 * Plays the hand on from `state` exactly as the simulator would, from decision `step` on
 * (the runner's per-decision random streams), with `bots` in the seats. Returns the state
 * once the hand has been scored.
 */
export async function finishHand(
  state: GameState,
  bots: readonly BotStrategy[],
  seed: string,
  step: number,
): Promise<GameState> {
  const hands = state.handHistory.length;
  let s = state;
  let k = step;
  while (s.phase !== 'game-over' && s.handHistory.length === hands) {
    k += 1;
    if (k > step + 2000) throw new Error('finishHand: the hand did not end');
    const { seat, obs } = nextActor(s);
    const bot = bots[seat] as BotStrategy;
    s = applyActionOrThrow(s, seat, await bot.decide(obs, decisionRng(seed, seat, k))).state;
  }
  return s;
}

/** The plain bot that plays a seat in a rollout: the strategy itself, or an oracle's stand-in. */
function rolloutBot(s: SimStrategy): BotStrategy {
  if (!isOracle(s)) return s;
  if (!s.rolloutBot) throw new Error(`hindsight: ${s.id} cannot be played in a rollout`);
  return s.rolloutBot;
}

/**
 * Evaluation-only: a Hard-family bot, except that the chosen kinds of contract decision are
 * made in hindsight. Each candidate action is applied to the true state and the rest of the
 * hand is played out by the bots at the table, with the very random streams the simulator
 * will use, so the candidate's realised match equity is known exactly; the best is played.
 * Later decisions in a rollout are the base bot's (one deviation at a time).
 *
 * Its margin over the base bounds what better decisions of that kind could gain: it knows
 * every hand, the widow and how the rest of the hand will go.
 */
export class HindsightBot implements OracleStrategy {
  readonly id: string;
  readonly needsState = true as const;
  readonly rolloutBot: BotStrategy;

  constructor(
    private readonly kinds: ReadonlySet<HindsightKind>,
    private readonly base: HardBot,
    /** Discards tried in hindsight: the best this many by a greedy open-hand playout. */
    private readonly discardTop = 6,
  ) {
    this.rolloutBot = base;
    this.id = `hindsight-${[...kinds].join('+')}`;
  }

  async decideWithState(
    state: GameState,
    seat: Seat,
    obs: Observation,
    rng: Rng,
    ctx?: OracleContext,
  ): Promise<Action> {
    const kind = obs.legal.kind;
    const own = this.base.decide(obs, rng);
    if (!ctx || !(kind === 'bid' || kind === 'discard' || kind === 'trump')) return own;
    if (!this.kinds.has(kind)) return own;
    const candidates = this.candidates(state, seat, obs, own);
    if (candidates.length < 2) return own;
    const bots = ctx.strategies.map(rolloutBot);
    const team = teamOf(seat);
    let best = own;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (const a of candidates) {
      const after = applyActionOrThrow(state, seat, a).state;
      const end = await finishHand(after, bots, ctx.seed, ctx.step);
      const r = end.handHistory[end.handHistory.length - 1];
      if (!r) throw new Error('hindsight: no hand result');
      const value = equityAfter(r, team, ME_TABLE);
      // Strictly better only: ties keep the base's own choice (listed first).
      if (value > bestValue + 1e-12) {
        bestValue = value;
        best = a;
      }
    }
    return best;
  }

  /** The actions tried, the base's own choice first. */
  private candidates(state: GameState, seat: Seat, obs: Observation, own: Action): Action[] {
    const legal = obs.legal;
    const out: Action[] = [own];
    const key = (a: Action) => JSON.stringify(a.type === 'discard' ? [...a.cardIds].sort() : a);
    const seen = new Set([key(own)]);
    const add = (a: Action) => {
      if (!seen.has(key(a))) {
        seen.add(key(a));
        out.push(a);
      }
    };
    if (legal.kind === 'bid') {
      if (legal.canCallMisdeal) add({ type: 'callMisdeal' });
      if (legal.canPass) add({ type: 'pass' });
      add({ type: 'bid', amount: legal.minBid });
    } else if (legal.kind === 'trump') {
      for (const suit of legal.suits) add({ type: 'nameTrump', suit });
    } else if (legal.kind === 'discard') {
      // Rank discards by their best greedy open-hand playout on the true deal.
      const hands = state.hand?.hands;
      if (!hands) return out;
      const ranked = new Map<string, { cards: CardId[]; value: number }>();
      for (const trump of SUITS) {
        for (const cards of discardCandidates(obs.hand, trump)) {
          const keep = obs.hand.filter((c) => !cards.includes(c));
          const capture = playoutWith(hands, seat, keep, trump)[teamOf(seat)] as number;
          const k = [...cards].sort((a, b) => a - b).join(',');
          const prev = ranked.get(k);
          if (!prev || capture > prev.value) ranked.set(k, { cards, value: capture });
        }
      }
      const top = [...ranked.values()].sort((a, b) => b.value - a.value).slice(0, this.discardTop);
      for (const t of top) add({ type: 'discard', cardIds: t.cards });
    }
    return out;
  }
}
