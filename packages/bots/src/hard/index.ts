import type { Action, Observation, Rng } from '@mam/engine';
import {
  captureUtility,
  type LeafUtility,
  ME_TABLE,
  type UtilityMode,
  type World,
} from '@mam/search';
import {
  CONTRACT_DEFAULTS,
  type ContractOptions,
  decideBid,
  decideDiscard,
  decideMisdeal,
  decideTrump,
} from '../contract/index';
import { HeuristicBot } from '../heuristic/index';
import { makeWorldWeight } from '../inference/index';
import { makeSpecialsWeight } from '../inference/specials';
import type { BotStrategy, DecideContext } from '../strategy';
import { PIMC_DEFAULTS, type PimcOptions, pimcValues } from './pimc';

export {
  PIMC_DEFAULTS,
  type PimcCall,
  type PimcOptions,
  type PimcResult,
  pimcValues,
} from './pimc';

export interface HardOptions extends PimcOptions, ContractOptions {
  /** Use search for each contract decision (false: the heuristic bot's choice). */
  readonly searchMisdeal: boolean;
  readonly searchBid: boolean;
  readonly searchDiscard: boolean;
  readonly searchTrump: boolean;
  /**
   * What card play maximises. 'linear': money won from here on minus the opponents'
   * (cheapest: solved positions are reusable whatever was captured before). 'margin': the
   * hand's score change minus the opponents', so making or setting the contract counts.
   * 'equity': the probability of winning the game.
   */
  readonly playUtility: 'linear' | UtilityMode;
  /** For 'margin'/'equity': apply it to each world's points values (cheap; see UtilityAt). */
  readonly fastUtility: boolean;
  /** With inference on (inferencePool > 0), weight worlds by the auction and trump choice. */
  readonly auctionInference: boolean;
  /** With inference on, also weight worlds by players' throw-offs. */
  readonly throwOffs: boolean;
  /**
   * With inference on, weight worlds by the Tiger, Bull and Bear evidence: players who could
   * have played one and did not (inference/specials.ts).
   */
  readonly specialsInference: boolean;
}

export const HARD_DEFAULTS: HardOptions = {
  ...PIMC_DEFAULTS,
  ...CONTRACT_DEFAULTS,
  searchMisdeal: true,
  searchBid: true,
  searchDiscard: true,
  searchTrump: true,
  playUtility: 'linear',
  fastUtility: true,
  // Weight card play's worlds by the Tiger, Bull and Bear evidence only: a small, repeated
  // gain on fixed fresh boards, where auction inference gave none (docs/bot-ladder.md, note 10).
  inferencePool: 6,
  auctionInference: false,
  throwOffs: false,
  specialsInference: true,
};

/**
 * Expert: the same algorithms with about three times Hard's budget. Card play spends it on
 * more worlds and exact solving from seven tricks out, not on depth: searching three tricks
 * deep instead of two cost 2.3× the time for no measurable gain (docs/bot-ladder.md).
 */
export const EXPERT_DEFAULTS: HardOptions = {
  ...HARD_DEFAULTS,
  worlds: 60,
  nodes: 12_000_000,
  depth: 2,
  exactTricks: 7,
  worldNodes: 1_200_000,
  bidWorlds: 400,
  screenWorlds: 80,
  refineWorlds: 24,
  refineTop: 5,
  refineDepth: 2,
};

/**
 * Soft-inference weight of a sampled world under these options (undefined: all worlds
 * equally likely). Shared by Hard's card play and the solo analysis.
 */
export function worldWeight(
  obs: Observation,
  o: HardOptions,
): ((world: World) => number) | undefined {
  if (o.inferencePool <= 0) return undefined;
  const parts: ((world: World) => number)[] = [];
  if (o.auctionInference) parts.push(makeWorldWeight(obs, { throwOffs: o.throwOffs }));
  const specials = o.specialsInference ? makeSpecialsWeight(obs) : undefined;
  if (specials) parts.push(specials);
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return (world) => parts.reduce((w, f) => w * f(world), 1);
}

/**
 * The "hard" bot: card play by PIMC search over sampled deals (pimc.ts); contract decisions
 * by simulation over sampled deals (contract/). Every input is the Observation.
 */
/** The moment halfway from now to `deadline` (no deadline stays none). */
function halfway(deadline: number): number {
  if (!Number.isFinite(deadline)) return deadline;
  const now = Date.now();
  return now + Math.max(0, deadline - now) / 2;
}

export class HardBot implements BotStrategy {
  readonly id: string = 'hard';
  private readonly heuristic = new HeuristicBot();
  readonly options: HardOptions;

  constructor(options: Partial<HardOptions> = {}) {
    this.options = { ...HARD_DEFAULTS, ...options };
  }

  decide(obs: Observation, rng: Rng, ctx: DecideContext = {}): Action {
    const o = this.options;
    const legal = obs.legal;
    const deadline = ctx.deadline ?? Number.POSITIVE_INFINITY;
    switch (legal.kind) {
      case 'bid': {
        // A first turn may call a misdeal instead; that check gets half the time.
        if (legal.canCallMisdeal) {
          const call = o.searchMisdeal
            ? decideMisdeal(obs, rng, o, halfway(deadline))
            : ({ type: 'callMisdeal' } as const);
          if (call) return call;
        }
        return o.searchBid ? decideBid(obs, rng, o, deadline) : this.heuristic.decide(obs, rng);
      }
      case 'discard':
        return o.searchDiscard
          ? decideDiscard(obs, rng, o, deadline)
          : this.heuristic.decide(obs, rng);
      case 'trump':
        return o.searchTrump ? decideTrump(obs, rng, o, deadline) : this.heuristic.decide(obs, rng);
      case 'play':
        return this.play(obs, rng, deadline);
      default:
        return this.heuristic.decide(obs, rng);
    }
  }

  private play(obs: Observation, rng: Rng, deadline: number): Action {
    const legal = obs.legal;
    if (legal.kind !== 'play') throw new Error('play outside playing');
    if (legal.cardIds.length === 1) return { type: 'playCard', cardId: legal.cardIds[0] as number };
    const weight = worldWeight(obs, this.options);
    const utility = this.playLeafUtility(obs);
    const result = pimcValues(obs, rng, this.options, {
      ...(utility ? { utility } : {}),
      ...(weight ? { weight } : {}),
      utilityAt: this.options.fastUtility ? 'root' : 'leaf',
      deadline,
    });
    // Ties (common: many cards are worth the same) go to the heuristic's choice.
    const preferred = this.heuristic.decide(obs, rng);
    const preferredCard = preferred.type === 'playCard' ? preferred.cardId : -1;
    let best = 0;
    for (let i = 1; i < result.moves.length; i++) {
      if ((result.means[i] as number) > (result.means[best] as number)) best = i;
    }
    const bestMean = result.means[best] as number;
    const pi = result.moves.indexOf(preferredCard);
    if (pi >= 0 && (result.means[pi] as number) >= bestMean - 1e-9) {
      return { type: 'playCard', cardId: preferredCard };
    }
    return { type: 'playCard', cardId: result.moves[best] as number };
  }

  /** Team 0's utility of final captures ($1000s); undefined = linear money difference. */
  private playLeafUtility(obs: Observation): LeafUtility | undefined {
    const mode = this.options.playUtility;
    if (mode === 'linear' || !obs.contract) return undefined;
    const u = captureUtility(
      {
        ruleset: obs.ruleset,
        scores: obs.scores,
        dealer: obs.dealer,
        bidder: obs.contract.bidder,
        bid: obs.contract.amount,
      },
      0,
      mode,
      ME_TABLE,
    );
    return (c0, c1) => u([c0 * 1000, c1 * 1000]);
  }
}
