# Make‑a‑Million – Strong Bot Design

How the **Hard** bot (and the experimental **Expert**) work, and why each setting is what it is. Rules are in `game-rules.md`, what bots may know is in `bot-standards.md`, measured results are in `bot-ladder.md`, and the state of the work and what to do next is in `bot-roadmap.md`.

## Can the game be solved?

**Not the whole game.** Make‑a‑Million is a 2‑vs‑2 team game with hidden cards, chance and an auction. From the first trick a player faces about 10²⁰ possible arrangements of the unseen cards, and partners cannot communicate, which makes computing an equilibrium intractable even for small team games. No bot can be guaranteed optimal.

**What the bots do get exactly right:**

- **Open‑hand positions.** With every hand visible, the solver finds the best play for both teams exactly. In TypeScript this is practical with about 7 tricks or fewer left.
- **Endgames.** When the unseen cards can be arranged in only a few ways, the bot lists every arrangement instead of sampling, so its choice is exactly best against its belief.
- **Equivalent cards.** Cards in one hand that are interchangeable (adjacent among the cards still out, with the same money value) are searched once.

**How closeness to optimal is measured** (details in `bot-ladder.md`):

- **Duplicate boards:** bots are compared on the same deals with the seats swapped, so luck cancels.
- **The Oracle:** a simulator‑only bot that sees every hand, which gives an upper bound. **Hybrids** and **peek** bots (also simulator‑only) show where the remaining gap lies.

## How Hard decides

Every decision starts from the bot's `Observation` only (`bot-standards.md`). The entry point is `HardBot.decide` in `packages/bots/src/hard/index.ts`.

### Card play: PIMC

Perfect‑information Monte Carlo (`packages/bots/src/hard/pimc.ts`):

1. **Belief.** List or sample arrangements of the unseen cards that are consistent with everything the seat has seen: hand sizes, voids (failing to follow trump also proves the player has no Tiger), Bull/Bear leads, and the discards the bidder knows (`packages/search/src/belief/sampler.ts`). Sampling is exact and uniform; when there are no more than `worlds` arrangements, all of them are listed instead.
2. **Solve each world with all hands open** (`packages/search/src/play/solver.ts`). With `exactTricks` (6) or fewer tricks left the solve is exact. Earlier it searches `depth` (2) tricks and estimates the rest with a greedy playout (`packages/search/src/play/playout.ts`). A world that needs more than `worldNodes` (250k) nodes is retried one trick shallower, and every later world uses the shallower depth too, so all worlds are valued the same way.
3. **Average** each legal card's value over the worlds and play the best. Ties go to the Normal bot's choice. The decision stops at `worlds` (40) worlds or `nodes` (2.5M) nodes, whichever comes first.

Card play maximises money won from here on minus the opponents' (`playUtility: 'linear'`). That keeps solved positions reusable across worlds; playing for match equity or for the hand's score lost (`bot-ladder.md`, notes 1 and 3).

### Contract decisions: simulation over sampled deals

`packages/bots/src/contract/` decides the misdeal call, the bid, the discard and the trump. These decisions value outcomes in **match equity**: the probability of winning the game after the hand is scored, from the table in `packages/search/src/generated/meTable.ts`.

- **Bid** (`evaluateBid`, `decideBid`). The only choice is to bid the minimum now or to pass. For each of `bidWorlds` (160) sampled deals:
  - **Declaring** is valued by a greedy open‑hand playout of this seat declaring (the Normal bot's discards and trump; `playoutDeclare`), passed through the **calibration** below. Like every simulated hand, the playout starts from the engine's opening lead (`openingLeader`: the player to the declarer's left).
  - **Passing** is valued by predicting how the rest of the auction ends. The other players' bidding ceilings come from the Normal bot's hand evaluation (`modelCeiling`), and the predicted declarer's contract is valued the same way.
  - Deals are weighted by how well they explain the bids and passes so far (`auctionLikelihood`, scale `auctionSigma`).
  - The bot **never raises over its partner's standing bid** (`raisePartner: false`).
- **Calibration** (`calibA` 130, `calibB` 0.5, `calibSd` 58, all in $1000s). The greedy playout badly understates weak hands, so the declaring team's capture is taken as Normal(130k + 0.5 × estimate, 58k²) and the utility is averaged over twelve equally likely points (`calibrated`). The parameters come from regressing the actual capture on the estimate over 571 played contracts (`packages/sim/scripts/calibrate.ts`). This was the largest single gain (`bot-ladder.md`, note 8). A refit after the first‑lead rule change (942 contracts) gave 116.5k + 0.56 × estimate, SD 56k: the same fit as before the change on the same bot, and within $5k of the defaults for most hands, so the defaults were kept (`bot-ladder.md`, Calibration).
- **Misdeal.** On its first turn to bid, when its hand qualifies: call a misdeal when the better of bidding the minimum and passing (valued as for a bid, from the auction as it stands) is worth less in equity than a fresh deal. This check gets half the decision's time; the bid gets the rest.
- **Discard and trump** (`bestCandidate`):
  1. List the legal discards for each trump suit (`discardCandidates`).
  2. **Screen** them by greedy playouts over `screenWorlds` (40) shared deals.
  3. **Re‑check** the best `refineTop` (4) with a `refineDepth` (1)‑trick search over `refineWorlds` (12) deals.

### Inference

Two kinds of soft inference re‑weight the sampled worlds when `inferencePool > 0`: draw `inferencePool × worlds` candidates, weight each, and resample. Hard weights by the specials only (`inferencePool` 6).

- **Auction and trump choice** (`auctionInference`, `inference/index.ts`): did not help (H0); off.
- **The specials** (`specialsInference`, `inference/specials.ts`). A player who could have played the Tiger, Bull or Bear and did not is less likely to hold it, by P(play | situation) fitted from self‑play (`inference/generated/specialsModel.ts`, written by `packages/sim/scripts/specials-model.ts`). Its three fixed 1500‑board runs gave +0.8%, +0.4% and +0.6% equity per board, pooling to +0.6% [0.1, 1.2] and +4.3k points per hand: a small gain, promoted (`bot-ladder.md`, note 10). Refit the model whenever card play or the rules change.

### Live‑play safety net

Search budgets are counted in nodes and samples, so a decision is deterministic for a given observation and seed. The server also passes a wall‑clock **deadline**: its fixed reply time minus 200 ms (`DecideContext`).

Past the deadline:
- card play keeps the worlds solved so far (or values one world one trick deep if none is finished);
- bidding and misdeal calls keep the deals sampled so far (at least 16);
- the discard and trump choice keeps the best candidate re‑checked so far.

Simulations pass no deadline, so their results do not depend on the machine.

## Settings

`HARD_DEFAULTS` (`packages/bots/src/hard/index.ts`) combines `PIMC_DEFAULTS` (`hard/pimc.ts`) and `CONTRACT_DEFAULTS` (`contract/index.ts`). Any option can be overridden in a simulator spec, for example `hard:worlds=20,raisePartner=1`.

| Option | Hard | What it does | Evidence |
|---|---|---|---|
| `worlds` / `nodes` | 40 / 2.5M | Card‑play sample size and node budget | 3× budget: no gain; 2.5M plays as well as 4M and keeps decisions under the 1.3 s deadline (p99 about 0.8 s) |
| `exactTricks` / `depth` | 6 / 2 | Exact solving from 6 tricks out; otherwise 2 tricks deep | depth 3: no gain |
| `exactWorlds` | 40 | Worlds once solving is exact | 400: H0 |
| `worldNodes` | 250k | Per‑world cap before going shallower | lowered with `nodes` |
| `playUtility` | `linear` | What card play maximises | `equity`, `margin`: rejected |
| `bidWorlds` | 160 | Deals for bid and misdeal decisions | — |
| `screenWorlds`, `refineTop`, `refineWorlds`, `refineDepth` | 40, 4, 12, 1 | Discard/trump screening and re‑check | — |
| `refineNodes` | ∞ | Node budget for the re‑check | Expert 24M: bounds its slowest discards and trumps to about 3 s, with 99.9% of choices unchanged |
| `utility` | `equity` | What contract decisions maximise | — |
| `raisePartner` | false | May raise over partner's standing bid | +5.7k points per hand, promoted |
| `calibA`, `calibB`, `calibSd` | 130, 0.5, 58 | Calibration of the playout estimate | +5.7% equity per board, promoted |
| `calibScreen` | false | Also calibrate the discard/trump screen | H0 |
| `screenValue` | `playout` | How the discard/trump screen values a candidate in a sampled deal: the greedy playout, or `model`, the contract‑value model with that keep and trump | rejected offline: changes 37% of discards, no better open‑hand value |
| `ceilingModel` | `heuristic` | The other players' bidding, for predicting the rest of the auction and weighting deals: the heuristic's ceilings, or `fitted`, a logistic model of how the bots really bid (`contract/auction.ts`, fitted by `scripts/auction-model.ts`) | inconclusive alone: +0.6% [−0.4, 1.7] on top of the contract‑value model (1500 boards). Expert: `fitted`, promoted with `contractValue` (below) |
| `contractValue` | `playout` | How bids value a contract in a sampled deal: the calibrated playout, or `model`, the learned contract‑value model (`contract/value.ts`, fitted by `scripts/contract-model.ts`) | alone, +0.6% [−0.2, 1.4] against Expert‑0 over two fixed 1500‑board runs. Expert: `model` with `ceilingModel: 'fitted'`, the bidding package: **+1.3% [0.4, 2.1]** equity, +8.5k [3.9, 13.2] points per hand against Expert‑0 over two fixed 1500‑board runs; promoted |
| `bidOutcome` | `win` | What bidding the minimum is worth in a sampled deal: declaring at that price, or `auction`, the rest of the auction by the bidding model (an opponent whose ceiling reaches the next price overcalls, we drop out, and the others finish it) | rejected: +0.2%, −2.4k points per hand against the contract‑value model |
| `bidMargin` | 0 | Required edge before bidding | 0.01: H0 on replication |
| `auctionSigma` | 20k | Scale of the auction likelihood | 40k: H0 |
| `ceilingShift`, `ceilingScale`, `partnerPassInformative` | 0, 1, true | Model of the other players' bidding | not yet tested (`bot-roadmap.md`) |
| `inferencePool`, `auctionInference`, `throwOffs`, `specialsInference` | 6, false, false, true | Soft inference for card play | specials: +4.3k points per hand, promoted |
| `leadWorlds` | 0 | Worlds for a lead before the exact window, the node budgets scaled to match (≤ `worlds`: off). Leads carry two thirds of the regret against the oracle | 180 vs 60 worlds: no better on 1200 banked leads (`bot-ladder.md`); rejected |
| `policyInference`, `policyTemperature`, `policyMix` | false, 1.5, 0.8 | Policy‑based inference: weight worlds by every other player's past card plays under the card‑play model (`inference/policy.ts`, fitted by `scripts/policy-model.ts`), each play's likelihood mixed with uniform over the legal cards, then tempered | not yet tested |

**Expert** (`EXPERT_DEFAULTS`) is Hard with `worlds` 60, `nodes` 8M, `exactTricks` 7, `worldNodes` 1.2M, `bidWorlds` 400, `screenWorlds` 80, `refineWorlds` 24, `refineTop` 5, `refineDepth` 2 and `refineNodes` 24M, sized for a 5 s reply time (4.8 s deadline; `bot-ladder.md`, Timing). These settings are frozen as the simulator spec `expert0` (Expert‑0, `packages/sim/src/registry.ts`), so that later changes to Expert can be measured against it. On top of them, Expert bids with the learned models: `contractValue: 'model'` values each sampled contract by the contract‑value model instead of the calibrated playout, and `ceilingModel: 'fitted'` predicts the rest of the auction (and weights the deals) by a model of how the bots really bid. It wins fewer contracts than Expert‑0 and makes more of them. It is not offered at the table; see `bot-roadmap.md`.

## Where the code is

| Piece | Where |
|---|---|
| Fast play state (bitmask hands, play/undo), checked against the engine | `packages/search/src/play/state.ts`, `convert.ts` |
| Open‑hand solver (alpha‑beta, cache, MTD(f), equivalent cards, node and clock limits) | `packages/search/src/play/solver.ts` |
| Greedy playout | `packages/search/src/play/playout.ts` |
| Belief sampler and enumeration | `packages/search/src/belief/sampler.ts` |
| Match equity, hand scoring, `splitRest` | `packages/search/src/equity.ts`, `generated/meTable.ts` |
| Hard / Expert, PIMC | `packages/bots/src/hard/` |
| Contract decisions, playouts, auction model, calibration | `packages/bots/src/contract/` |
| Inference (auction, throw‑offs, specials) | `packages/bots/src/inference/` |
| Oracle, hybrid and peek diagnostics | `packages/sim/src/oracle.ts`, registered in `packages/sim/src/registry.ts` |
| Duplicate boards, SPRT, match equity tables | `packages/sim/src/duplicate.ts`, `stats.ts`, `matchEquity.ts` |
| Experiment and diagnostic scripts | `packages/sim/scripts/` (listed in `bot-roadmap.md`) |
| Server worker pool, deadline, late‑answer warning | `apps/server/src/botPool.ts`, `botWorker.ts`, `room.ts` |

## Performance notes

- **Exact solving** handles about 7 tricks left in tens of milliseconds. The cost grows about 5× per extra trick, so a full 13‑trick solve is out of reach. The solver runs about 11M nodes per second, and a Rust port (perhaps 3–5× faster) would not change that, so the search stays in TypeScript.
- **Depth‑limited search.** At 7 tricks left, searching 3 tricks deep and estimating the rest with a greedy playout picks the exactly best move 70% of the time, with a mean regret of $3.8k.
- **Budgets** count playout plies as nodes, so a budget tracks real time. The slow decisions are card play early in the hand; contract decisions are fast for Hard (p99 under 0.3 s). Measured decision times are in `bot-ladder.md` (Timing).
