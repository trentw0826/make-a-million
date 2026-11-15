import { type CardId, cardById, type Observation, type Seat, SUITS } from '@mam/engine';
import type { World } from '@mam/search';
import { auctionLikelihood, type Deal } from '../contract/simulate';
import { expectedCapture } from '../heuristic/evaluate';

/**
 * Soft inference for card play: how well a sampled world explains the public evidence,
 * under a model of how players bid and choose trump (the heuristic bot's). Worlds are then
 * resampled in proportion to this weight. The model is tempered (`temperature` > 1 flattens
 * it) so that a human who bids differently does not make the bot certain of wrong things.
 */
export function makeWorldWeight(obs: Observation, temperature = 1.5): (world: World) => number {
  const played = new Map<Seat, CardId[]>();
  for (const t of [...obs.tricks, ...(obs.currentTrick ? [obs.currentTrick] : [])]) {
    for (const p of t.plays) {
      const list = played.get(p.seat) ?? [];
      list.push(p.cardId);
      played.set(p.seat, list);
    }
  }
  const step = obs.ruleset.bidding.bidStep;
  const bidder = obs.contract?.bidder ?? null;
  const trump = obs.trump;
  const trumpEvidence = trump !== null && bidder !== null && bidder !== obs.seat;

  return (world) => {
    // Each seat's 13 cards at the time of the auction (held now + already played).
    const hands = [0, 1, 2, 3].map((s) =>
      s === obs.seat ? obs.hand : [...(world.hands[s] ?? []), ...(played.get(s as Seat) ?? [])],
    );
    const deal: Deal = { hands, widow: world.pile };
    let w = auctionLikelihood(deal, obs, step);
    if (trumpEvidence) {
      // The bidder named the suit their final 13 cards valued most.
      const cards = (hands[bidder] ?? []).map(cardById);
      const values = SUITS.map((s) => expectedCapture(cards, s));
      const max = Math.max(...values);
      const z = values.reduce((a, v) => a + Math.exp((v - max) / 25_000), 0);
      w *= Math.exp(((values[SUITS.indexOf(trump)] as number) - max) / 25_000) / z;
    }
    return w ** (1 / temperature);
  };
}
