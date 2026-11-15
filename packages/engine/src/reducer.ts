import type { Action } from './actions';
import { DECK, HAND_SIZE, type Suit, sortHand, sumMoney } from './cards';
import { type RuleError, RuleViolation } from './errors';
import type { GameEvent } from './events';
import { validate } from './legal';
import { Rng, seedToState } from './rng';
import { DEFAULT_RULESET, type Ruleset } from './ruleset';
import { nextSeat, otherTeam, SEATS, type Seat, type Team, teamOf } from './seats';
import type { Auction, GameState, HandResult, HandState, Trick, TrickSummary } from './state';
import { summarizeTrick, trickWinner } from './tricks';

export type ApplyResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly error: RuleError };

export interface CreateGameOptions {
  readonly seed: string | number;
  readonly ruleset?: Ruleset;
  /** Dealer of the first hand. Default: seat 0. */
  readonly dealer?: Seat;
}

/** A new game with the first hand already dealt. */
export function createGame(options: CreateGameOptions): GameState {
  const seed = String(options.seed);
  const base: GameState = {
    ruleset: options.ruleset ?? DEFAULT_RULESET,
    seed,
    rngState: seedToState(options.seed),
    phase: 'misdeal-window',
    scores: [0, 0],
    dealer: options.dealer ?? 0,
    handHistory: [],
    hand: null,
    winner: null,
  };
  const draft = structuredClone(base) as Mutable<GameState>;
  startHand(draft, draft.dealer, 1, 0, []);
  return draft;
}

/** Apply one action for one seat. Illegal actions are reported, never applied. */
export function applyAction(state: GameState, seat: Seat, action: Action): ApplyResult {
  const error = validate(state, seat, action);
  if (error) return { ok: false, error };

  const draft = structuredClone(state) as Mutable<GameState>;
  const events: GameEvent[] = [];
  const hand = draft.hand as Mutable<HandState>;

  switch (action.type) {
    case 'callMisdeal': {
      events.push({ type: 'misdealCalled', seat });
      startHand(draft, hand.dealer, hand.handNumber, hand.redeals + 1, events);
      break;
    }
    case 'declineMisdeal': {
      hand.misdeal = { ...hand.misdeal, pending: hand.misdeal.pending.filter((s) => s !== seat) };
      events.push({ type: 'readyToBid', seat });
      if (hand.misdeal.pending.length === 0) beginBidding(hand, events);
      break;
    }
    case 'bid': {
      const auction = hand.auction as Mutable<Auction>;
      auction.entries = [...auction.entries, { seat, kind: 'bid', amount: action.amount }];
      auction.highBid = { bidder: seat, amount: action.amount };
      events.push({ type: 'bid', seat, amount: action.amount });
      advanceAuction(draft, hand, events);
      break;
    }
    case 'pass': {
      const auction = hand.auction as Mutable<Auction>;
      auction.entries = [...auction.entries, { seat, kind: 'pass' }];
      auction.passed = [...auction.passed, seat];
      events.push({ type: 'pass', seat });
      advanceAuction(draft, hand, events);
      break;
    }
    case 'discard': {
      const keep = hand.hands[seat].filter((id) => !action.cardIds.includes(id));
      setHand(hand, seat, keep);
      hand.discards = [...action.cardIds];
      hand.phase = 'naming-trump';
      hand.turn = seat;
      events.push({ type: 'discarded', seat });
      break;
    }
    case 'nameTrump': {
      hand.trump = action.suit;
      hand.phase = 'playing';
      hand.turn = seat;
      hand.currentTrick = { leader: seat, plays: [], suit: null, winner: null };
      events.push({ type: 'trumpNamed', seat, suit: action.suit });
      break;
    }
    case 'playCard': {
      playCard(draft, hand, seat, action.cardId, events);
      break;
    }
    case 'continue': {
      startHand(draft, nextSeat(hand.dealer), hand.handNumber + 1, 0, events);
      break;
    }
  }

  return { ok: true, state: draft, events };
}

/** Like applyAction, but throws RuleViolation on an illegal action. */
export function applyActionOrThrow(
  state: GameState,
  seat: Seat,
  action: Action,
): { state: GameState; events: readonly GameEvent[] } {
  const result = applyAction(state, seat, action);
  if (!result.ok) throw new RuleViolation(result.error);
  return { state: result.state, events: result.events };
}

// ---------------------------------------------------------------------------

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function setHand(hand: Mutable<HandState>, seat: Seat, cards: readonly number[]): void {
  const hands = [...hand.hands] as [number[], number[], number[], number[]];
  hands[seat] = sortHand(cards);
  hand.hands = hands;
}

/** Deal a new hand. The same dealer deals again after a misdeal. */
function startHand(
  draft: Mutable<GameState>,
  dealer: Seat,
  handNumber: number,
  redeals: number,
  events: GameEvent[],
): void {
  const rng = new Rng(draft.rngState);
  const deck = rng.shuffle(DECK.map((c) => c.id));
  draft.rngState = rng.state();

  // One card at a time, clockwise, starting left of the dealer. The last three form the widow.
  const hands: [number[], number[], number[], number[]] = [[], [], [], []];
  let seat = nextSeat(dealer);
  for (let i = 0; i < HAND_SIZE * 4; i++) {
    hands[seat].push(deck[i] as number);
    seat = nextSeat(seat);
  }
  const widow = deck.slice(HAND_SIZE * 4);

  const { misdeal } = draft.ruleset;
  const eligible = misdeal.enabled
    ? SEATS.filter((s) => sumMoney(hands[s]) <= misdeal.threshold)
    : [];

  const opener = nextSeat(dealer);
  const hand: Mutable<HandState> = {
    handNumber,
    dealer,
    redeals,
    phase: 'misdeal-window',
    hands: [sortHand(hands[0]), sortHand(hands[1]), sortHand(hands[2]), sortHand(hands[3])],
    widow,
    discards: [],
    misdeal: { pending: [...SEATS], eligible },
    auction: { entries: [], passed: [], turn: opener, highBid: null },
    contract: null,
    trump: null,
    tricks: [],
    currentTrick: null,
    turn: null,
    result: null,
  };

  draft.dealer = dealer;
  draft.hand = hand;
  draft.phase = 'misdeal-window';
  events.push({ type: 'handStarted', handNumber, dealer, redeals });

  // With misdeals disabled nobody has anything to call, so go straight to bidding.
  if (!misdeal.enabled) beginBidding(hand, events);
}

function beginBidding(hand: Mutable<HandState>, events: GameEvent[]): void {
  hand.misdeal = { pending: [], eligible: [] };
  hand.phase = 'bidding';
  hand.turn = hand.auction.turn;
  events.push({ type: 'biddingStarted', opener: hand.auction.turn });
}

function advanceAuction(
  draft: Mutable<GameState>,
  hand: Mutable<HandState>,
  events: GameEvent[],
): void {
  const auction = hand.auction as Mutable<Auction>;
  const high = auction.highBid;

  if (auction.passed.length === 4) {
    // Only possible when the opener may pass: throw the hand in and deal again.
    events.push({ type: 'handPassedOut' });
    startHand(draft, nextSeat(hand.dealer), hand.handNumber, 0, events);
    return;
  }

  if (high && auction.passed.length === 3) {
    hand.contract = high;
    // The bidder picks up the widow (the widow array stays as the record of what it held).
    setHand(hand, high.bidder, [...hand.hands[high.bidder], ...hand.widow]);
    hand.phase = 'discarding';
    hand.turn = high.bidder;
    events.push({ type: 'auctionWon', seat: high.bidder, amount: high.amount });
    return;
  }

  let next = nextSeat(auction.turn);
  while (auction.passed.includes(next)) next = nextSeat(next);
  auction.turn = next;
  hand.turn = next;
}

function playCard(
  draft: Mutable<GameState>,
  hand: Mutable<HandState>,
  seat: Seat,
  cardId: number,
  events: GameEvent[],
): void {
  const trump = hand.trump as Suit;
  const trick = hand.currentTrick as Mutable<Trick>;
  const card = DECK[cardId];
  if (!card) throw new Error(`invalid card ${cardId}`);

  setHand(
    hand,
    seat,
    hand.hands[seat].filter((id) => id !== cardId),
  );
  trick.plays = [...trick.plays, { seat, cardId }];
  if (trick.suit === null) {
    if (card.kind === 'suit') trick.suit = card.suit;
    else if (card.kind === 'tiger') trick.suit = trump;
  }
  events.push({ type: 'cardPlayed', seat, cardId });

  if (trick.plays.length < 4) {
    hand.turn = nextSeat(seat);
    return;
  }

  const winner = trickWinner(trick, trump);
  trick.winner = winner;
  hand.tricks = [...hand.tricks, trick];
  events.push({ type: 'trickWon', seat: winner, trickIndex: hand.tricks.length - 1 });

  if (hand.hands.every((h) => h.length === 0)) {
    hand.currentTrick = null;
    hand.turn = null;
    scoreHand(draft, hand, events);
    return;
  }

  hand.currentTrick = { leader: winner, plays: [], suit: null, winner: null };
  hand.turn = winner;
}

function scoreHand(draft: Mutable<GameState>, hand: Mutable<HandState>, events: GameEvent[]): void {
  const contract = hand.contract;
  const trump = hand.trump;
  if (!contract || !trump) throw new Error('scoring without a contract');

  const summaries: TrickSummary[] = hand.tricks.map(summarizeTrick);
  const captured: [number, number] = [0, 0];
  for (const t of summaries) captured[teamOf(t.winner)] += t.value;

  const biddingTeam = teamOf(contract.bidder);
  const made = captured[biddingTeam] >= contract.amount;
  const delta: [number, number] = [0, 0];
  delta[biddingTeam] = made ? captured[biddingTeam] : -contract.amount;
  delta[otherTeam(biddingTeam)] = captured[otherTeam(biddingTeam)];

  const scoresAfter: [number, number] = [draft.scores[0] + delta[0], draft.scores[1] + delta[1]];

  const result: HandResult = {
    handNumber: hand.handNumber,
    dealer: hand.dealer,
    redeals: hand.redeals,
    bidder: contract.bidder,
    bid: contract.amount,
    trump,
    biddingTeam,
    captured,
    made,
    delta,
    scoresAfter,
    tricks: summaries,
  };

  draft.scores = scoresAfter;
  draft.handHistory = [...draft.handHistory, result];
  hand.result = result;
  hand.phase = 'hand-complete';
  events.push({ type: 'handScored', result });

  const winner = decideWinner(scoresAfter, biddingTeam, draft.ruleset);
  if (winner !== null) {
    draft.winner = winner;
    draft.phase = 'game-over';
    events.push({ type: 'gameOver', winner });
  } else {
    draft.phase = 'hand-complete';
  }
}

export function decideWinner(
  scores: readonly [number, number],
  biddingTeam: Team,
  ruleset: Ruleset,
): Team | null {
  const reached = scores.map((s) => s >= ruleset.targetScore);
  if (!reached[0] && !reached[1]) return null;
  if (scores[0] !== scores[1]) return scores[0] > scores[1] ? 0 : 1;
  return ruleset.tieBreak === 'bidding-team' ? biddingTeam : null;
}
