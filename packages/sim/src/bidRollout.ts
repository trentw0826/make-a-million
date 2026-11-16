import { evaluateBid, HardBot } from '@mam/bots';
import {
  type Action,
  applyActionOrThrow,
  createGame,
  type GameState,
  legalMoves,
  nextSeat,
  observe,
  otherTeam,
  Rng,
  SEATS,
  type Seat,
  teamOf,
} from '@mam/engine';
import { ME_TABLE, startEquity } from '@mam/search';
import { isOracle, makeStrategy, type SimStrategy } from './strategies';
import type { PlayInput } from './tasks';

/** One bid decision played out both ways (bid the minimum, or pass), with common randomness. */
export interface BidRolloutLine {
  readonly seat: Seat;
  readonly minBid: number;
  /** Who held the standing bid ('none': no bid yet, which the opener's forced bid prevents). */
  readonly high: 'none' | 'opponent';
  /** Scores before the hand: the deciding team's, then the opponents'. */
  readonly scores: readonly [number, number];
  /** The bot's own evaluation (mean utility of declaring and of passing). */
  readonly declare: number;
  readonly pass: number;
  /** Who the bot's model expected to win the auction if it passed. */
  readonly ifPassOpponent: number;
  /** What the bot actually chose. */
  readonly chose: 'bid' | 'pass';
  /** Realised match equity and points margin of bidding minus passing, for the deciding team. */
  readonly dEquity: number;
  readonly dPoints: number;
}

/** Chance that a given optional bid decision is the one branched at. */
const BRANCH_P = 0.35;

async function decide(
  strategy: SimStrategy,
  state: GameState,
  seat: Seat,
  rng: Rng,
): Promise<Action> {
  const obs = observe(state, seat);
  return isOracle(strategy)
    ? strategy.decideWithState(state, seat, obs, rng)
    : strategy.decide(obs, rng);
}

function actor(state: GameState): Seat | undefined {
  return SEATS.find((s) => legalMoves(state, s).kind !== 'none');
}

/** Plays the current hand to its end; per-decision randomness keyed by seat and step. */
async function finishHand(
  state: GameState,
  strategies: readonly SimStrategy[],
  key: string,
): Promise<GameState> {
  const hands = state.handHistory.length;
  let s = state;
  for (let step = 0; s.handHistory.length === hands && s.phase !== 'game-over'; step++) {
    if (step > 400) throw new Error('hand did not finish');
    const seat = actor(s);
    if (seat === undefined) throw new Error('nobody can act');
    const action = await decide(
      strategies[seat] as SimStrategy,
      s,
      seat,
      Rng.fromSeed(`${key}:${seat}:${step}`),
    );
    s = applyActionOrThrow(s, seat, action).state;
  }
  return s;
}

function outcome(before: GameState, after: GameState, seat: Seat): [number, number] {
  const team = teamOf(seat);
  const opp = otherTeam(team);
  const r = after.handHistory[after.handHistory.length - 1];
  if (!r) throw new Error('no hand result');
  const equity =
    after.winner !== null
      ? after.winner === team
        ? 1
        : 0
      : startEquity(ME_TABLE, r.scoresAfter, team, nextSeat(r.dealer));
  const points =
    r.scoresAfter[team] - before.scores[team] - (r.scoresAfter[opp] - before.scores[opp]);
  return [equity, points];
}

/**
 * Plays an auction with the given bots; at one optional bid decision chosen at random (not
 * when partner holds the bid), plays the hand out after bidding the minimum and after
 * passing. Null when no decision was chosen or the hand was redealt.
 */
export async function bidRolloutTask(input: PlayInput): Promise<BidRolloutLine | null> {
  const strategies = input.specs.map(makeStrategy);
  let state = createGame({
    seed: input.seed,
    dealer: input.dealer,
    ...(input.scores ? { scores: input.scores } : {}),
    ...(input.ruleset ? { ruleset: input.ruleset } : {}),
  });
  const first = state.hand?.hands[0].join();
  const pick = Rng.fromSeed(`${input.seed}:branch`);
  for (
    let step = 0;
    state.hand && ['misdeal-window', 'bidding'].includes(state.hand.phase);
    step++
  ) {
    if (state.hand.hands[0].join() !== first) return null; // redealt
    const seat = actor(state);
    if (seat === undefined) return null;
    const obs = observe(state, seat);
    const strategy = strategies[seat] as SimStrategy;
    const rng = Rng.fromSeed(`${input.seed}:auction:${seat}:${step}`);
    const legal = obs.legal;
    if (legal.kind === 'bid' && legal.canPass) {
      const last = [...obs.auction].reverse().find((e) => e.kind === 'bid');
      const partnerHigh = last !== undefined && teamOf(last.seat) === teamOf(seat);
      if (!partnerHigh && strategy instanceof HardBot && pick.next() < BRANCH_P) {
        const e = evaluateBid(obs, Rng.fromSeed(`${input.seed}:eval`), strategy.options);
        if (!e) return null;
        const chose = (await strategy.decide(obs, rng)).type === 'bid' ? 'bid' : 'pass';
        const key = `${input.seed}:rollout`;
        const afterBid = await finishHand(
          applyActionOrThrow(state, seat, { type: 'bid', amount: legal.minBid }).state,
          strategies,
          key,
        );
        const afterPass = await finishHand(
          applyActionOrThrow(state, seat, { type: 'pass' }).state,
          strategies,
          key,
        );
        const [eqBid, ptsBid] = outcome(state, afterBid, seat);
        const [eqPass, ptsPass] = outcome(state, afterPass, seat);
        const team = teamOf(seat);
        return {
          seat,
          minBid: legal.minBid,
          high: last === undefined ? 'none' : 'opponent',
          scores: [state.scores[team], state.scores[otherTeam(team)]],
          declare: e.declare,
          pass: e.pass,
          ifPassOpponent: e.ifPass.opponent,
          chose,
          dEquity: eqBid - eqPass,
          dPoints: ptsBid - ptsPass,
        };
      }
    }
    state = applyActionOrThrow(state, seat, await decide(strategy, state, seat, rng)).state;
  }
  return null;
}
