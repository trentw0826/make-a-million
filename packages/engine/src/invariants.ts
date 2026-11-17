import { type CardId, DECK_SIZE, sortHand, sumMoney, TOTAL_MONEY } from './cards';
import { SEATS } from './seats';
import type { GameState } from './state';
import { openingLeader } from './tricks';

/** Every card that must be accounted for in the current hand, exactly once each. */
export function allCardsInPlay(state: GameState): CardId[] {
  const hand = state.hand;
  if (!hand) return [];
  // Until the auction ends the widow is set aside; afterwards its cards are in the
  // bidder's hand or among the discards.
  const widowAside = hand.phase === 'bidding';
  return [
    ...hand.hands.flat(),
    ...(widowAside ? hand.widow : []),
    ...hand.discards,
    ...(hand.currentTrick?.plays.map((p) => p.cardId) ?? []),
    ...hand.tricks.flatMap((t) => t.plays.map((p) => p.cardId)),
  ];
}

export class InvariantViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvariantViolation';
  }
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new InvariantViolation(message);
}

/** Throws InvariantViolation if `state` is not a well-formed reachable state. */
export function assertInvariants(state: GameState): void {
  const hand = state.hand;
  if (hand) {
    const all = allCardsInPlay(state);
    check(all.length === DECK_SIZE, `expected ${DECK_SIZE} cards in play, found ${all.length}`);
    check(new Set(all).size === DECK_SIZE, 'a card appears more than once');
    check(sumMoney(all) === TOTAL_MONEY, 'money in play is not conserved');

    for (const seat of SEATS) {
      const own = hand.hands[seat];
      check(
        own.every((id, i) => i === 0 || (own[i - 1] as number) < id),
        `hand of seat ${seat} is not sorted`,
      );
      check(own.length === sortHand(own).length, 'hand size changed by sorting');
    }

    if (hand.phase === 'playing') {
      check(hand.trump !== null, 'trump must be named before play');
      check(hand.contract !== null, 'a contract must exist before play');
      check(hand.currentTrick !== null, 'a trick must be in progress during play');
      check(hand.discards.length === 3, 'exactly three cards must be discarded');
      check(hand.turn !== null, 'someone must have the turn during play');
      const firstLeader = hand.tricks[0]?.leader ?? hand.currentTrick?.leader;
      check(
        hand.contract === null || firstLeader === openingLeader(hand.contract.bidder),
        'the player to the left of the bidder must lead the first trick',
      );
    }

    if (hand.result) {
      const faceMoney = hand.result.tricks.reduce((sum, t) => sum + t.money, 0);
      check(
        faceMoney === TOTAL_MONEY - sumMoney(hand.discards),
        'money in tricks must equal deck money minus discarded money',
      );
    }
  }

  const start = state.initialScores ?? [0, 0];
  let expected: [number, number] = [start[0], start[1]];
  for (const r of state.handHistory) {
    expected = [expected[0] + r.delta[0], expected[1] + r.delta[1]];
    check(
      r.scoresAfter[0] === expected[0] && r.scoresAfter[1] === expected[1],
      `score sheet is inconsistent at hand ${r.handNumber}`,
    );
    const firstLeader = r.tricks[0]?.leader;
    check(
      firstLeader === undefined || firstLeader === openingLeader(r.bidder),
      `the player to the left of the bidder must lead the first trick of hand ${r.handNumber}`,
    );
  }
  check(
    state.scores[0] === expected[0] && state.scores[1] === expected[1],
    'scores must equal the sum of hand deltas',
  );

  if (state.phase === 'game-over') {
    check(state.winner !== null, 'a finished game must have a winner');
  }
}
