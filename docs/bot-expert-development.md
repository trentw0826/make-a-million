# Expert – How It Was Developed

The story of the Expert work, 22–24 November 2026 (branch `expert-bot`): the brief, how the work was run, each phase, every idea and what became of it, what shipped, and what was learned. It ties the other bot documents together:

- **How Expert works:** `bot-design.md` ("How Expert differs", and the settings table).
- **Every measured number:** `bot-ladder.md` (Results, the robustness gate, Expert experiments, Headroom, Offline screens, Timing).
- **The literature review:** `bot-research.md`.
- **Status, the seeds used, the scripts and simulator specs, how to resume:** `bot-roadmap.md`.

Intervals are 95%. "Equity" is match equity per board, "points" are points per hand; both are A's margin over B on duplicate boards.

## The outcome

Expert is Hard's search (PIMC card play, simulated contract decisions) with a bigger budget and three better inputs: bidding by learned models, and card play that weights its sampled deals by every card played and by the auction. It is offered at the table with a 5 s reply time.

| Expert against | Seeds, boards | Equity (95% CI) | Points (95% CI) |
|---|---|---|---|
| **Hard** (live at the table) | `xb14`, `xb15`: 2 × 1500 fixed, pooled | **+3.90% [3.00, 4.80]** | **+28.4k [23.3, 33.4]** |
| Expert‑0 (where it started) | `xb21`: 1500 fixed | +1.36% [0.10, 2.62] | +13.6k [6.6, 20.6] |
| Normal | `xb19`: 800 fixed | +14.32% [12.53, 16.12] (Hard: +11.59%) | +69.7k [60.7, 78.6] (Hard: +55.2k) |

It passed the robustness gate (a weak partner, a passive bidder, a weaker table). Its slowest decision on the dev machine took 2.7 s against a 4.8 s deadline, and one server with its default 4 bot workers carries 32 rooms of four Expert bots without a late answer. Hard is unchanged: its `HARD_DEFAULTS` are untouched and a golden test of its decisions still passes.

## The brief

The work followed a written brief (`.claude/prompts/expert-bot-research.md`, kept outside the repository). Its main points:

- **Goal:** make Expert the strongest bot this codebase can offer. Expert then was Hard with about 3× the budget, simulator‑only, too slow for its reply time (a loaded machine showed discards up to 9.6 s), and never measured against the current Hard.
- **Fixed decisions:**
  - Hard is live and frozen.
  - Expert's reply time is 5 s (4.8 s deadline), with a p99 of 4.5 s or less on the idle dev machine with 4 workers.
  - Each decision runs on one thread.
  - Nothing may be installed without asking (there was no numpy or torch, so models were fitted in TypeScript).
  - Nothing is merged without the owner.
- **Constraints on every idea:**
  - Every decision input comes from the seat's Observation, and each new feature extractor gets a leak test.
  - Decisions are deterministic, with budgets counted in nodes and samples, and honour `DecideContext.deadline`.
  - Nothing carries over between decisions.
  - Rules stay in `packages/engine`; `@mam/bots` depends only on the engine and the search.
  - Learned models ship as generated TypeScript, each with a script that regenerates it and a header that records its data, seed and command.
  - Edits to files that the solo‑mode branch was refactoring stay small and additive.
- **Phases:** 0, a baseline that fits its time; 1, the literature; 2, measure the headroom before building; 3, implement and test, best bet first.
- **Protocol:** duplicate boards with common random numbers, fresh seeds for every run, an SPRT screen (δ = 1% equity, at least 200 boards), fixed 1500‑board runs for small effects, replication before promotion, pooling by inverse variance, and every result recorded, rejections included.
- **Stopping rule:** stop when every idea left is expected to gain less than about 0.5% equity per board, the smallest gain a 3000‑board run can detect.
- **Shipping:** if Expert beat Hard, replicated and with an equity interval excluding zero, and fit its time, prepare one commit offering it at the table, pass a robustness gate, and load‑test rooms of Expert bots.

## How the work was run

**Safety first.** The first commit (`47946ec`) records Hard's action at 364 decisions of every kind, on fixed hands and seeds, in a golden test (`packages/bots/test/hardGolden.test.ts`). Every change after it is an option that is off by default, so the golden test proves that Hard's decisions did not move. New feature extractors (the contract‑value features, the auction model's, the card‑play policy's) have leak tests: hidden cards are reshuffled consistently with the Observation, and the features and the action must not change.

**Duplicate testing.** Every comparison plays the same boards from both sides, with per‑decision common random numbers, at realistic scores (`bot-ladder.md`, How results are measured). Screens used the SPRT. Small effects were measured on fixed runs of 1500 fresh boards (`SPRT=0`), because an SPRT's estimate is biased toward the verdict that stopped it (note 9 in the ladder). A change was promoted only after a second fixed run on fresh boards. The two runs were pooled by inverse variance, with SE = (upper − lower) / 3.92. The standard was the one that had promoted Hard's specials inference (ladder note 10): both point estimates positive, a clear points gain, at a small time cost.

**Seeds.** A new family, `xb1`–`xb21`, plus named seeds for timing, data and diagnostics. Each was used once and is listed in `bot-roadmap.md`, so no change was selected and confirmed on the same boards.

**Offline screens before duplicate runs.** A 1500‑board Expert run takes about 90 minutes on 22 workers. So each idea was first checked on banked positions in seconds or minutes:
- **Decision bank** (`scripts/timing-bank.ts`): 400 self‑play hands with their true deals, seed `timing-xb1`.
- **Regret** against the true deal solved with all hands open (`REGRET=1`, `compare-bank.ts`).
- **Discard value** on the true deal (`discard-dd.ts`).
- **Belief metric** (`inference-eval.ts`): the log‑probability that a weighted pool of worlds gives each unseen card's true holder.

**Compute discipline.** The machine has 24 threads; experiments ran on 22 workers.
- **One large experiment at a time.** A small job runner in the session's scratch directory took commands one by one from a queue file, so the order could be changed without stopping a run.
- **Frozen code.** Every experiment ran from a detached checkout of a fixed commit (`git worktree add --detach`, then `pnpm install --frozen-lockfile --offline`), so edits on the branch could not reach a running experiment.
- **Timing only on an idle machine.** The simulator sets no deadline, so duplicate results do not depend on load. But timing does, and the first "too slow" figures turned out to be mostly load.
- **Raw outputs stayed out of git:** JSONL results, training data and banks. The numbers that matter are in the docs.

**Resumability.** After every experiment the roadmap's Status section was updated: what is running, what was learned, the current best settings and the next step. Commits went one idea at a time.

## Timeline

| When | What |
|---|---|
| 22 Nov | Golden test for Hard. Decision bank. Phase 0 timing: Expert fitted to its time and frozen as Expert‑0 |
| 22–23 Nov | Phase 1 literature review (`bot-research.md`). Phase 2 diagnostics built: peek at any card group, hindsight oracles for the contract decisions, regret and rollout for card play. Expert‑0 against Hard (`xb1`) |
| 23 Nov | Models fitted: contract value, auction, card‑play policy. Screens and fixed runs of the bidding ideas (`xb4`–`xb11`). Bidding package promoted (`b4cf522`) |
| 23–24 Nov | Policy inference measured (`xb3`, `xb13`) and promoted (`2fbe326`). Auction inference screened offline, measured (`xb12`, `xb20`) and promoted (`0caa02d`). Card‑play headroom measured, plan re‑ranked, stopping rule met |
| 24 Nov | Final Expert against Hard (`xb14`, `xb15`), the robustness gate (`xb16`–`xb19`), Expert offered at the table (`97af165`), Expert against Expert‑0 (`xb21`), load tests |

## Phase 0: a baseline that fits its time

**The problem.** On a loaded machine Expert's discards averaged 3.3 s, and its slowest decisions went past 9 s.

**What was found.**
- On the idle machine the old budget's p99 was 2.7 s: the alarming figures were mostly load. A decision bank still showed rare tails: a discard at 4.2 s, a trump at 7.3 s, card play up to 5.0 s.
- The dev machine's CPU has 8 performance and 8 efficiency cores, and a decision that lands on an efficiency core takes up to about twice as long. Budgets were sized for that.
- **Card play.** The slow plays were the first exact solves seven tricks out, which used the whole 12M‑node budget after 10–47 of the 60 worlds. On 1348 banked positions scored against the true deal, 8M nodes chose no worse than 12M, so `nodes` became 8M.
- **Discard and trump.** Their re‑check had no node cap. With `refineNodes` 24M, 99.9% of 800 banked choices were unchanged, and the slowest took 3.0 s.
- Searching three tricks deep instead of two cost 2.3× the time for no measurable gain.

**Result:** Expert‑0 (`0454397`, simulator spec `expert0`): every decision kind's p99 at 3.0 s or less. Against Hard over 1500 fixed fresh boards (`xb1`) it gained +1.35% [0.05, 2.65] equity and +9.8k [2.6, 17.1] points. A bigger budget alone was worth a little; the rest had to come from better inputs.

## Phase 1: what the literature says

The review (`bot-research.md`, with sources) answered one question: which methods beyond PIMC and calibration have measurably improved bots in trick‑taking games with hidden hands, bidding and partners?

Its answer: **better inputs to PIMC, not a better search.**
- In Skat, policy‑based inference (weighting each sampled world by a model of every other player's past actions) and learned contract evaluators gave the largest gains.
- In bridge, bidders that roll the auction forward with their own policy did.
- Search that removes strategy fusion (αμ, recursive PIMC) changed about 1% of bridge deals at several times the cost.
- End‑to‑end learned agents lose to PIMC in trick‑taking, or need data‑centre compute.

The review ranked a plan:
1. A contract‑value model.
2. A model of how the bots really bid.
3. Policy‑based inference over all card play.
4. Better widow and trump decisions.
5. A robustness matrix.
6. An exact endgame diagnostic, to decide whether fusion‑free search was worth building.

It also flagged the main risk: every model would be fitted to the bots' own play and then meet humans.

## Phase 2: measure the headroom before building

The diagnostics live in `packages/sim` only. Their results are in `bot-ladder.md`, Headroom; all ran against Expert‑0 on the same 200 fresh boards, seed `xb2`.

- **Where card play loses** (`regret.ts`, 12,416 plays). Leads carry two thirds of the regret against the true deal, and defenders' leads the most: wrong half the time, 26k a decision. The early tricks dominate.
- **Hindsight oracles for the contract decisions** (`hindsight:kinds=…`). Each one knows every candidate's exact result:
  - bid and misdeal: +27.9%, mostly clairvoyance, since the oracle declares only contracts it will make;
  - trump: +6.0%;
  - discard: +5.7%.
- **Information against search** (`hybrid`, `rollout`, `peek`).
  - An all‑seeing player gains +19.2% (+131k a hand), +4.5% (+30k) in the last 4 tricks alone.
  - But valuing the last 4 tricks' cards by realistic playouts, with no strategy fusion and no assumption that the others see every hand, gains only +0.5% [−0.9, 1.9] (+2.7k).
  - **So the gap is information, not PIMC's flaws.**
  - Knowing partner's hand is worth +9.8% (70k), the left‑hand opponent's +9.2%, where the money lies +8.8%, the trumps +7.2%. The Tiger, Bull and Bear are worth only +1.3%, because specials inference already has most of it.

This ordered Phase 3: bidding first (cheap, and the clearest local weakness), then card‑play inference (the one lever with information headroom). Search fixes and deeper search came last, since realistic playouts and depth both bought nothing.

## Phase 3: the ideas, in the order they were tried

Each idea was stated as a hypothesis against a Phase 2 bound, checked offline, built as an option, then tested against the current best Expert. "On top" means against the Expert of the time.

### The contract‑value model (`contractValue: 'model'`)

- **Hypothesis.** Bidding valued a contract by a greedy playout plus a linear calibration, which predicts the declaring team's capture poorly (r 0.48–0.55). A learned model of the capture would tell hands apart.
- **Built.**
  - Data: `contract-data.ts` recorded 4000 self‑play contracts with the auction scripted so that a random seat declares, so weak hands are covered (`xb-cvm1`), and 2000 natural ones (`xb-cvm2`).
  - Model: a ridge‑regression model of 23 features of the deal (`contract/value.ts`, generated `contract/generated/contractModel.ts`).
- **Offline.** On held‑out natural contracts, r 0.72 against 0.55 for the calibrated playout; RMSE 46k against 56k; make/set log loss 0.41 against 0.49.
- **Duplicate.**
  - SPRT H1 at 845 boards: +2.03% [0.63, 3.44] (`xb4`).
  - A fixed 1500‑board confirmation gave only +0.38% (`xb7`), and a second +0.77% (`xb9`). Pooled: +0.58% [−0.19, 1.35], +3.1k.
  - **The screen's estimate was mostly its stopping bias.**
- **Verdict:** not promoted alone; promoted later inside the bidding package.

### The fitted auction model (`ceilingModel: 'fitted'`)

- **Hypothesis.** Bidding predicted the rest of the auction with heuristic ceilings that describe timid, uncalibrated bidders. A model fitted to how the calibrated bots really bid would predict better.
- **Built.** A logistic model of P(bid | the seat's 13 cards, price) on 11,462 natural auction turns (`contract/auction.ts`, generated `auctionModel.ts`).
- **Offline.** Held‑out log loss 0.567, against 0.647 for a constant rate and 2.31 for the heuristic ceilings. The bots bid 65% of the time nearly regardless of the hand.
- **Duplicate.** On top of the contract‑value model: +0.62% [−0.42, 1.65], +1.3k (`xb5`), SPRT still undecided at its 1500‑board cap.
- **Verdict:** inconclusive alone; tested together with the contract‑value model.

### The bidding package (both models)

- **Duplicate.** Against Expert‑0, two fixed 1500‑board runs: +1.51% [0.30, 2.71] (`xb10`) and +1.03% [−0.14, 2.19] (`xb11`). Pooled: **+1.26% [0.42, 2.10], +8.5k [3.9, 13.2]**. Expert now wins fewer contracts and makes more of them.
- **Timing.** A bid about 15 ms slower; everything else unchanged.
- **Verdict:** **promoted** (`b4cf522`).

### Valuing a bid by the rest of the auction (`bidOutcome: 'auction'`)

- **Hypothesis.** The bidding oracle won much of its margin by pushing opponents into contracts they then failed. A bid valued by the opponents' modelled overcalls might capture some of that.
- **Offline.** It changed 10% of banked bid turns, mostly passes into bids, at no cost in time.
- **Duplicate.** +0.23% [−0.76, 1.21] but −2.4k [−7.9, 3.1] (`xb8`). It won 61% of contracts and made fewer of them.
- **Verdict:** **rejected.** Pushing opponents up gains nothing without the oracle's knowledge that they will fail.

### A stronger discard and trump evaluation (`screenValue: 'model'`, bigger re‑check)

- **Hypothesis.** The hindsight discard and trump oracles gain about 6% each, so a better screen of the candidates, or a bigger re‑check, might pick better ones.
- **Offline.**
  - On 400 banked discards with true hands, the model screen changed 37% of discards but was worth only +0.7k [−2.4, 3.8] per discard on the true deal.
  - `refineWorlds` 40 instead of 24 changed 21% and was worth +0.15k [−1.65, 1.95], at 1.5× the time.
- **Verdict:** **both rejected** offline. The candidates are close in value, which is why both moved so many discards and gained nothing.

### More worlds for leads (`leadWorlds`)

- **Hypothesis.** Leads carry two thirds of the regret, so their per‑card averages might be too noisy.
- **Offline.** On 1200 banked leads, 180 worlds instead of 60 gave a regret 0.77k [−1.25, 2.79] *higher*, at 2.4× the time.
- **Verdict:** **rejected:** lead regret is not sampling noise.

### Policy‑based inference (`policyInference`)

- **Hypothesis.** The specials model (who passed up a chance to play the Tiger, Bull or Bear) had recovered some of the information gap. A model of every card play would recover more.
- **Built.** A conditional‑logit card‑play model with 30 features, fitted on 16,495 Hard self‑play plays (`xb-policy1`; `inference/policy.ts`, generated `policyModel.ts`).
  - Each sampled world is weighted by the probability of every play the other players made in it.
  - The weight is tempered (temperature 1.5) and mixed with uniform play over the legal cards (mix 0.8), so play the model does not expect, such as a human's, cannot make Expert certain of wrong things.
  - A 360‑world pool is resampled to 60.
- **Offline.**
  - The model: held‑out log‑likelihood −1.137 per play against −1.397 for uniform; it picks the bot's card 54% of the time.
  - The belief metric: the weighted pool moved the truth's probability ten times as far as the specials model (+0.020 to +0.025 nats a card, by bank).
  - A regret screen was inconclusive: it cannot resolve gains this small.
- **Duplicate.** On top of the bidding package: +1.21% [0.37, 2.04] (`xb3`), replicated at +0.45% [−0.41, 1.30] (`xb13`). Pooled: **+0.84% [0.24, 1.43], +3.9k [0.6, 7.1]**, for about 10% more decision time.
- **Verdict:** **promoted** (`2fbe326`).

### Auction inference by the fitted model (`auctionInference` with `ceilingModel: 'fitted'`)

- **Hypothesis.** Hard's auction weighting had been rejected long before, with the heuristic ceilings. The fitted bidding model might make it work.
- **Offline.** The heuristic ceilings make the true deal *less* likely than no weighting at all, which explains the old rejection. The fitted model moves it the right way: five times as far as the specials model, a third as far as the policy model.
- **Duplicate.** On top of policy inference: +0.61% [−0.29, 1.51] (`xb12`) and +0.64% [−0.26, 1.55] (`xb20`). Pooled: **+0.63% [−0.01, 1.27], +3.9k [0.5, 7.3]**, for about 9% more decision time.
- **Verdict:** **promoted** on the note‑10 standard (`0caa02d`).

### Retempering the combined weights

- **Offline only.** Expert multiplies the specials, policy and auction weights. A sweep of each setting (policy temperature and mix, auction temperature, pool size) found Expert's settings near the best.
- The best of each together would gain about 0.006 nats a card. That is about 0.2% equity, scaled by the ratio policy inference showed (0.025 nats for +0.84%).
- **Verdict:** **rejected:** under the stopping rule's 0.5%. Mix 1.0 would also drop the guard against unexpected play.

### Not built: each expected under 0.5%

With the headroom measured, every remaining idea was expected to gain less than the stopping rule's 0.5% a board:

| Idea | Why it was not built |
|---|---|
| Auction evidence for the discard and trump choice | The auction carries under 1% of what the hindsight oracle knows, against its 6% bound: about 0.05% |
| Search with less strategy fusion (αμ, recursive PIMC) | The realistic‑playout bound in the last 4 tricks is +2.7k [−5.6, 11.0], under 0.5% even at its top; bridge found the same |
| A learned leaf evaluation | Deeper search gained nothing in real play; it helps only with the cards open, and a leaf model is another way of searching deeper |
| Budget allocation | More nodes, more worlds, more lead worlds and a bigger re‑check each gained nothing |
| A bigger match‑equity table for Expert | Equity card play lost for Hard; a bigger table would change decisions near score thresholds by about the table's own noise (1.6% a cell) |

**The stopping rule was met** on 24 November, and the work moved to the final measurements.

## The final measurements

All from the frozen final Expert (`0caa02d`) unless stated. The details are in `bot-ladder.md`.

**Against Hard:** +3.68% [2.39, 4.97] (`xb14`) and +4.11% [2.86, 5.35] (`xb15`). Pooled: **+3.90% [3.00, 4.80], +28.4k [23.3, 33.4]**. Expert wins fewer contracts than Hard (46% against 54%) and makes more of them (77% against 70%).

**Against Expert‑0:** +1.36% [0.10, 2.62], +13.6k [6.6, 20.6] (`xb21`).
- The three promoted steps sum to about +2.7%, just above this interval. Steps promoted on noisy estimates are biased upward, and gains need not add.
- Measured through Hard instead, the difference is +2.55% [0.97, 4.13]. The two estimates agree within their noise.

**The robustness gate** (800 fresh boards each, `xb16`–`xb19`). It asks whether Expert is no worse than Hard in seatings where self‑play could mislead:

| Setting | Expert's margin | Hard's margin, same boards |
|---|---|---|
| partnered with Normal, against Hard with Normal | +0.78% [−0.80, 2.35], **+9.2k [0.6, 17.8]** | — |
| partnered with Easy, against Hard with Easy | +0.68% [−1.12, 2.48], **+15.3k [4.8, 25.9]** | — |
| against a passive bidder (uncalibrated Hard) | **+4.39%**, +18.1k | +2.42%, +0.2k |
| against Normal | **+14.32%**, +69.7k | +11.59%, +55.2k |

**Passed.** With a weak partner the partner's mistakes dominate the equity, but Expert still gains points. Against the passive bidder and against Normal it beats each by more than Hard does.

**Timing** (idle dev machine, 4 workers, p99 / max in ms):

| Decision | Expert‑0 | Final Expert |
|---|---|---|
| all | 1889 / 2988 | 1760 / 2682 |
| bid | 78 / 118 | 94 / 114 |
| discard | 2951 / 2951 | 2620 / 2682 |
| trump | 2801 / 2988 | 2562 / 2603 |
| play, 21–28 cards left | 1966 / 2113 | 1814 / 1867 |

**Load** (`apps/server/scripts/load-test.ts`, the server's own room code, 4 bot workers, four Expert bots a room):

| Rooms | p99 | Late answers |
|---|---|---|
| 16 | 1.4 s | 0 |
| 32 | 1.6 s | 0 |
| 48 | 4.7 s | 0.9% |
| 64 | 4.8 s | 4.8% |
| 80 | 4.8 s | 9.6% |

From 48 rooms decisions queue. Every search stops at its deadline, so answers still arrive within the 5 s reply time (at most 84 ms past the deadline, inside its 200 ms margin), but a queued decision searches for less time. For comparison, 64 rooms of four Hard bots ran with no late answer and a p99 of 0.3 s, far from their limit.

## Shipping

The ship commit (`97af165`) makes `expert` a level in the protocol's `DifficultySchema`, gives it a 5 s `botDelayMs`, adds its label and its place after Hard in the lobby's level picker, and updates the level lists in `multiplayer.md`, `architecture.md` and the README. It removes the strong‑bots item from `todo.md` and checks the four levels in the e2e smoke test. The server already ran Expert on its worker threads alongside Hard. `pnpm check`, the server tests three runs in a row and `pnpm e2e` passed, and the lobby and table screenshots were looked at.

**Decisions made by the owner** (24 November):
- Keep the full 5 s Expert as the default Expert for now. Its p99 of 1.8 s would allow a shorter reply time, but that is left for later.
- Merge the branch into `main`. `main` had gained solo mode since the branch was cut; that merge is described in its own commit.

## What was learned

**About the bot.**
- **The gap is information, not search.** Card play was saturated on budget before the work began, and Phase 2 showed why: realistic playouts in place of open‑hand solves gain about nothing, while knowing one more hand is worth 70k. Every card‑play gain came from better beliefs about the hidden cards.
- **Bidding is where cheap gains were.** A learned contract value and a fitted model of the other bidders together gained more than either alone, and more than the whole Phase 0 budget.
- **Models of the bots' own play work against bots.** All three models were fitted on Hard self‑play. The tempering and the mix with uniform play are the guard for humans, but Expert has never been measured against human play.
- **The models must be refitted when the bots' play changes,** like the specials model: the policy model describes Hard's card play, and the auction model describes calibrated Hard's bidding.

**About the method.**
- **SPRT screens overstate.** The contract‑value model's H1 at +2.03% shrank to +0.38% on fixed boards. Fixed runs and replication are what made the promotions trustworthy.
- **Steps measured one on top of another overstate the whole.** The steps summed to +2.7% against Expert‑0, and a direct run gave +1.36%. Report the direct comparison too.
- **The belief metric predicted duplicate gains; regret screens could not resolve them.** On banked positions, a difference of 0.1k per decision, the size of a real inference gain, is below the regret metric's noise. The belief metric (nats per unseen card) ranked the inference ideas the way the duplicate runs did, and its ratio to equity gave a usable estimate for the retempering sweep.
- **Offline screens saved most of the compute.** Five ideas were rejected in minutes on banked positions instead of hours of duplicate play: the model discard screen, the bigger re‑check, more lead worlds, retempering, and (through the bound) the unbuilt ideas.
- **Timing on a busy machine misleads.** The original "Expert is too slow" figures were mostly load. Size budgets on the idle machine and a decision bank, which gives the rare decisions (discard, trump) enough samples for a real p99.

**Practical pitfalls.**
- Node takes the `TEMP` environment variable as its temporary directory. A script parameter named `TEMP` created stray directories, so `inference-eval.ts` uses `POLICY_TEMP` and `POLICY_MIX`.
- Run experiments from frozen detached checkouts. Two runs were stopped unread in their first minutes when the queue changed, and seed `xb6` was dropped; frozen checkouts kept the rest clean.

## Reproducing the key results

From `packages/sim`, with Node 24 on `PATH`. A 1500‑board Expert run takes about 90 minutes on 22 workers.

```
# The final Expert against Hard, Expert-0 and Normal
SPRT=0 BOARDS=1500 WORKERS=22 SEED=xb14 pnpm exec tsx scripts/experiments.ts out.jsonl "expert|hard"
SPRT=0 BOARDS=1500 WORKERS=22 SEED=xb21 pnpm exec tsx scripts/experiments.ts out.jsonl "expert|expert0"
SPRT=0 BOARDS=800  WORKERS=22 SEED=xb19 pnpm exec tsx scripts/experiments.ts out.jsonl "expert|normal"

# The robustness gate: a team is a bot and its partner
SPRT=0 BOARDS=800 WORKERS=22 SEED=xb16 pnpm exec tsx scripts/experiments.ts out.jsonl "expert&normal|hard&normal"
SPRT=0 BOARDS=800 WORKERS=22 SEED=xb18 pnpm exec tsx scripts/experiments.ts out.jsonl "expert|hard:calibA=0,calibB=1,calibSd=0"

# A Phase 2 bound, and a step on top of the Expert of the time
SPRT=0 BOARDS=200 WORKERS=22 SEED=xb2 pnpm exec tsx scripts/experiments.ts out.jsonl "peek:cards=partner,base=expert0|expert0"
SPRT=0 BOARDS=1500 WORKERS=22 SEED=xb20 pnpm exec tsx scripts/experiments.ts out.jsonl "expert:policyInference=1,auctionInference=1|expert:policyInference=1"

# Timing (idle machine) and the decision bank
WORKERS=4 SEED=timing-xb2 pnpm exec tsx scripts/timing.ts expert 120
SEED=timing-xb1 pnpm exec tsx scripts/timing-bank.ts collect bank.jsonl 400 hard
WORKERS=4 pnpm exec tsx scripts/timing-bank.ts time bank.jsonl expert bid,misdeal,discard,trump

# Load (from apps/server, idle machine)
BOT_WORKERS=4 pnpm exec tsx scripts/load-test.ts expert 16,32,48,64,80 8
```

Since `EXPERT_DEFAULTS` changed during the work, a step is reproduced by spelling it on `expert0`: the bidding package is `expert0:contractValue=model,ceilingModel=fitted`. Each generated model's header records the commands that made its data and fitted it. For example, the contract‑value model is regenerated by `FORCED=1 SEED=xb-cvm1 tsx scripts/contract-data.ts cvm-hard-forced.jsonl 4000 hard`, `SEED=xb-cvm2 tsx scripts/contract-data.ts cvm-hard-natural.jsonl 2000 hard`, then `WRITE=1 tsx scripts/contract-model.ts cvm-hard-forced.jsonl cvm-hard-natural.jsonl`.

## What is next

`bot-roadmap.md` ("What is left") has the list. Briefly:
- carry Expert's inference gains to Hard, each tested at Hard's budget;
- a richer card‑play model, the one lever with headroom left;
- measure Expert with human partners and opponents;
- refit the models whenever the bots' play changes.
