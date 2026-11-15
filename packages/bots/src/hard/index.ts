import type { Action, Observation, Rng } from '@mam/engine';
import { captureUtility, type LeafUtility, ME_TABLE, type UtilityMode } from '@mam/search';
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
import type { BotStrategy } from '../strategy';
import { PIMC_DEFAULTS, type PimcOptions, pimcValues } from './pimc';

export { PIMC_DEFAULTS, type PimcOptions, type PimcResult, pimcValues } from './pimc';

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
  /** With inference on, also weight worlds by players' throw-offs. */
  readonly throwOffs: boolean;
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
  throwOffs: false,
};

/** Expert: the same algorithms with about four times Hard's budget, spent on depth. */
export const EXPERT_DEFAULTS: HardOptions = {
  ...HARD_DEFAULTS,
  worlds: 60,
  nodes: 16_000_000,
  depth: 3,
  exactTricks: 7,
  worldNodes: 1_500_000,
  bidWorlds: 400,
  screenWorlds: 80,
  refineWorlds: 24,
  refineTop: 5,
  refineDepth: 2,
};

/**
 * The "hard" bot: card play by PIMC search over sampled deals (pimc.ts); contract decisions
 * by simulation over sampled deals (contract/). Every input is the Observation.
 */
export class HardBot implements BotStrategy {
  readonly id: string = 'hard';
  private readonly heuristic = new HeuristicBot();
  readonly options: HardOptions;

  constructor(options: Partial<HardOptions> = {}) {
    this.options = { ...HARD_DEFAULTS, ...options };
  }

  decide(obs: Observation, rng: Rng): Action {
    const o = this.options;
    const legal = obs.legal;
    switch (legal.kind) {
      case 'misdeal':
        return o.searchMisdeal ? decideMisdeal(obs, rng, o) : this.heuristic.decide(obs, rng);
      case 'bid':
        return o.searchBid ? decideBid(obs, rng, o) : this.heuristic.decide(obs, rng);
      case 'discard':
        return o.searchDiscard ? decideDiscard(obs, rng, o) : this.heuristic.decide(obs, rng);
      case 'trump':
        return o.searchTrump ? decideTrump(obs, rng, o) : this.heuristic.decide(obs, rng);
      case 'play':
        return this.play(obs, rng);
      default:
        return this.heuristic.decide(obs, rng);
    }
  }

  private play(obs: Observation, rng: Rng): Action {
    const legal = obs.legal;
    if (legal.kind !== 'play') throw new Error('play outside playing');
    if (legal.cardIds.length === 1) return { type: 'playCard', cardId: legal.cardIds[0] as number };
    const weight =
      this.options.inferencePool > 0
        ? makeWorldWeight(obs, { throwOffs: this.options.throwOffs })
        : undefined;
    const result = pimcValues(
      obs,
      rng,
      this.options,
      this.playLeafUtility(obs),
      weight,
      undefined,
      this.options.fastUtility ? 'root' : 'leaf',
    );
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
