import { type BotStrategy, playoutDeclare } from '@mam/bots';
import {
  type Action,
  type AuctionEntry,
  type CardId,
  type Observation,
  Rng,
  type Seat,
  type Suit,
} from '@mam/engine';
import { playGame } from './runner';
import { isOracle, makeStrategy, type SimStrategy } from './strategies';
import type { PlayInput } from './tasks';

/**
 * A bot whose auction is scripted so that `declarer` wins it: the declarer bids the minimum
 * whenever it is not already high, everyone else passes (the opener's forced bid aside), and
 * nobody calls a misdeal. Every other decision is the bot's own. Card play maximises points
 * whatever the bid, so the capture is the bot's for that deal and declarer.
 */
class ForcedAuction implements BotStrategy {
  readonly id: string;
  constructor(
    private readonly inner: BotStrategy,
    private readonly declarer: Seat,
  ) {
    this.id = `forced-${inner.id}`;
  }

  decide(obs: Observation, rng: Rng): Action | Promise<Action> {
    const legal = obs.legal;
    if (legal.kind !== 'bid') return this.inner.decide(obs, rng);
    const high = [...obs.auction].reverse().find((e) => e.kind === 'bid');
    if (obs.seat === this.declarer) {
      return high?.seat === obs.seat && legal.canPass
        ? { type: 'pass' }
        : { type: 'bid', amount: legal.minBid };
    }
    return legal.canPass ? { type: 'pass' } : { type: 'bid', amount: legal.minBid };
  }
}

export interface ContractDataInput extends PlayInput {
  /** Script the auction so that a seat chosen at random from the seed declares. */
  readonly forced?: boolean;
}

/**
 * One played contract with its whole deal: training and test data for contract-value
 * models (simulator only: the deal is hidden information, used here as a label's context).
 */
export interface ContractRecord {
  readonly seed: string;
  readonly dealer: Seat;
  readonly scores: readonly [number, number];
  /** The deal the hand was played from (after any misdeals): 13 cards a seat, and the widow. */
  readonly hands: readonly (readonly CardId[])[];
  readonly widow: readonly CardId[];
  readonly auction: readonly AuctionEntry[];
  readonly bidder: Seat;
  readonly bid: number;
  readonly trump: Suit;
  readonly discards: readonly CardId[];
  /** Money each team captured ($). */
  readonly captured: readonly [number, number];
  readonly made: boolean;
  /** The bidding's greedy-playout estimate on the true deal: the declaring team's $. */
  readonly estimate: number;
}

/**
 * Plays one hand and returns its contract with the deal (null when nobody declared). With
 * `forced`, a random seat is made to declare, so the data covers every kind of hand, not
 * only the ones that win auctions.
 */
export async function contractDataTask(input: ContractDataInput): Promise<ContractRecord | null> {
  const declarer = Rng.fromSeed(`${input.seed}:declarer`).int(4) as Seat;
  const strategies = input.specs.map((spec) => {
    const s: SimStrategy = makeStrategy(spec);
    if (!input.forced) return s;
    if (isOracle(s)) throw new Error('contract data: a forced auction needs plain bots');
    return new ForcedAuction(s, declarer);
  }) as unknown as Parameters<typeof playGame>[0]['strategies'];
  let deal: { hands: CardId[][]; widow: CardId[] } | null = null;
  const { state } = await playGame({
    seed: input.seed,
    dealer: input.dealer,
    strategies,
    ...(input.scores ? { scores: input.scores } : {}),
    hands: 1,
    ...(input.ruleset ? { ruleset: input.ruleset } : {}),
    onDecision: ({ state: s }) => {
      // During the auction the hands are the deal; a misdeal deals new ones.
      const hand = s.hand;
      if (hand?.phase === 'bidding') {
        deal = { hands: hand.hands.map((h) => [...h]), widow: [...hand.widow] };
      }
    },
  });
  const r = state.handHistory[0];
  const hand = state.hand;
  const d = deal as { hands: CardId[][]; widow: CardId[] } | null;
  if (!r || !hand || !d) return null;
  const team = r.bidder % 2;
  return {
    seed: input.seed,
    dealer: r.dealer,
    scores: input.scores ?? [0, 0],
    hands: d.hands,
    widow: d.widow,
    auction: hand.auction.entries,
    bidder: r.bidder,
    bid: r.bid,
    trump: r.trump,
    discards: hand.discards,
    captured: r.captured,
    made: r.made,
    estimate: (playoutDeclare(d, r.bidder)[team] as number) * 1000,
  };
}
