# Strong Bots – Status and Roadmap

Where the work on the strong bots stands, what was learned, what is left, and how to pick it up. How the bots work is in `bot-design.md`; every measured result is in `bot-ladder.md`; how the Expert work was run, phase by phase, is in `bot-expert-development.md`.

## Status (2026‑11‑24)

**The Expert work is done** and merged into `main` (branch `expert-bot`, 2026‑11‑24; the brief is `.claude/prompts/expert-bot-research.md`; how it was run is in `bot-expert-development.md`). Where it stands:

- **Phase 0, a baseline Expert that fits its time: done.** Expert‑0 (`expert0`) has every decision kind's p99 at 3.0 s or less, and beats the current Hard by **+1.35% [0.05, 2.65]** equity and **+9.8k [2.6, 17.1]** points per hand over 1500 fixed fresh boards (seed `xb1`). Not yet replicated.
- **Phase 1, the literature review: done** (`bot-research.md`). The gains over PIMC in comparable games came from better inputs to it: learned contract values and policy‑based inference. Search fixes for strategy fusion changed about 1% of deals in bridge.
- **Phase 2, measuring the headroom: done** (`bot-ladder.md`, Headroom; all on the same 200 fresh boards, seed `xb2`, against Expert‑0). Two thirds of card play's open‑hand regret is in leads, mostly defenders' leads, in the first six tricks. Hindsight oracles: bid and misdeal +27.9% [24.7, 31.1] (mostly clairvoyance), trump +6.0%, discard +5.7%. Card play: an all‑seeing player gains +19.2% [16.1, 22.3] (+131k a hand), +4.5% (+30k) in the last 4 tricks alone; but valuing the last 4 tricks' cards by realistic playouts instead of open‑hand solves gains only +0.5% [−0.9, 1.9] (+2.7k), so **the gap is information, not PIMC's flaws**. Expert‑0's own search on the true deal gains +15.9% (+110k); knowing partner's hand alone is worth +9.8% (70k), the left‑hand opponent's +9.2% (67k), the money cards' places +8.8% (55k), the trumps' +7.2% (47k), the specials' only +1.3% (9k: specials inference already has most of it).
- **The plan re‑ranked after Phase 2** (expected gain per board on top of the current Expert):
  1. *Sharper card‑play inference* (tempering and mix of the combined weights, a bigger pool): the one lever with headroom left. On the offline belief metric Expert's settings are near the best; the best of each together would gain about 0.006 nats a card, about 0.2% equity by policy inference's ratio (`bot-ladder.md`, Offline screens). **Rejected** offline. A richer card‑play model might add as much again; not built.

  So every idea left is expected to gain under 0.5% a board: **the stopping rule is met.** What remains is the final Expert against Hard (two fixed runs of 1500 fresh boards) and the robustness gate, then offering Expert at the table if it passes.
  2. *Auction evidence for the discard and trump choice*: about 0.05% (the auction carries under 1% of the information the hindsight oracle has, whose bound is 6%). Not built.
  3. *Search with less fusion*: the rollout bound in the last 4 tricks is 2.7k [−5.6, 11.0], under 0.5% even at its top; bridge found the same. Not built.
  4. *Learned leaf evaluation*: deeper search gained nothing in real play (it helps only with the cards open), and a leaf model is another way of searching deeper. Under 0.5%. Not built.
  5. *Budget allocation*: more nodes, more worlds, more lead worlds and a bigger discard re‑check each gained nothing. Under 0.5%. Not built.
  6. *Match equity*: card play in equity lost for Hard; a bigger table only for Expert would change decisions near score thresholds by about the table's noise (1.6% equity a cell). Under 0.5%. Not built.
- **Phase 3, candidates built** (all options, off by default; Hard unchanged by the golden test):
  - `contractValue: 'model'`, a learned contract‑value model for bidding: fitted; r 0.72 against 0.55 for the calibrated playout on held‑out natural contracts. **SPRT H1** against Expert‑0: +2.03% [0.63, 3.44], +12.5k [4.7, 20.4] at 845 boards (`xb4`). **Not confirmed** on a fixed 1500 fresh boards: +0.38% [−0.73, 1.49], +1.9k [−4.2, 8.1] (`xb7`). A second fixed run gave +0.77% [−0.30, 1.84] (`xb9`); pooled, **+0.58% [−0.19, 1.35]**, +3.1k [−1.2, 7.4]. Not promoted alone; the **bidding package** (with `ceilingModel: 'fitted'`) beats Expert‑0 on two fixed runs of 1500 fresh boards: +1.51% [0.30, 2.71] (`xb10`) and +1.03% [−0.14, 2.19] (`xb11`); pooled, **+1.26% [0.42, 2.10]** equity and **+8.5k [3.9, 13.2]** points per hand. **Promoted** to `EXPERT_DEFAULTS`.
  - `ceilingModel: 'fitted'`, the other bidders as the bots really bid (also for card play's `auctionInference`): fitted; log loss 0.57 against 2.31 for the heuristic ceilings. On top of `contractValue: 'model'`: +0.62% [−0.42, 1.65], +1.3k [−4.4, 7.0] over 1500 boards, SPRT continue at its cap (`xb5`; a first start against plain Expert‑0 was stopped after two minutes, unread, and `xb6` was dropped). Inconclusive alone; **promoted** as part of the bidding package (above).
  - `policyInference`, inference from every past card play: model fitted; belief metric clearly better, regret screen inconclusive; on top of the bidding package, a fixed 1500 fresh boards: **+1.21% [0.37, 2.04]** equity, +4.3k [−0.3, 8.8] points per hand, for about 10% more decision time (`xb3`; a first start on top of the contract‑value model alone was stopped after two minutes, unread). Replicated: +0.45% [−0.41, 1.30] (`xb13`); pooled, **+0.84% [0.24, 1.43]** equity and **+3.9k [0.6, 7.1]** points per hand. Timing is fine (p99 1.7 s overall, idle machine). **Promoted** to `EXPERT_DEFAULTS`.
  - `auctionInference` with the fitted bidding model, card play's worlds weighted by the auction: rejected for Hard with the heuristic ceilings, which offline make the true deal less likely than no weighting; the fitted model makes it more likely, about five times as much as the specials model (`bot-ladder.md`, Offline screens). On top of policy inference, 1500 fresh boards: +0.61% [−0.29, 1.51] equity, +4.4k [−0.5, 9.3] points per hand, SPRT still undecided at the cap (`xb12`). Replicated on a fixed 1500 fresh boards: +0.64% [−0.26, 1.55] (`xb20`); pooled, **+0.63% [−0.01, 1.27]** equity and **+3.9k [0.5, 7.3]** points per hand, for about 10% more decision time. **Promoted** to `EXPERT_DEFAULTS` on the standard that promoted specials inference (`bot-ladder.md`, note 10).
  - `bidOutcome: 'auction'`, a bid valued by the rest of the auction (an opponent who would pay more overcalls): changes 10% of banked bid turns, mostly passes to bids. On top of the contract‑value model: +0.23% [−0.76, 1.21], −2.4k [−7.9, 3.1] over 1500 boards (`xb8`), winning 61% of the contracts. **Rejected.**
  - `leadWorlds`, more worlds for leads: rejected offline (no better on 1200 banked leads).
  - `screenValue: 'model'`, the discard and trump screen by the contract‑value model: changes 37% of banked discards (1% of trump choices) but their open‑hand value on the true deal only by +0.7k [−2.4, 3.8] per discard. Rejected offline. So is a bigger discard re‑check (`refineWorlds` 40: +0.15k [−1.65, 1.95] at 1.5× the time).
- **Current best Expert:** Expert‑0 with the bidding package, policy inference and auction inference (`EXPERT_DEFAULTS` = `expert0:contractValue=model,ceilingModel=fitted,policyInference=1,auctionInference=1`). On the idle machine every decision kind's p99 is under 2.7 s (overall 1.76 s, max 2.68 s; `bot-ladder.md`, Timing).
- **The final Expert against Hard** (two fixed runs of 1500 fresh boards, `xb14` and `xb15`, from `0caa02d`): +3.68% [2.39, 4.97] and +4.11% [2.86, 5.35]; pooled, **+3.90% [3.00, 4.80]** equity and **+28.4k [23.3, 33.4]** points per hand. It wins fewer contracts than Hard (46% against 54%) and makes more of them (77% against 70%).
- **The robustness gate: passed** (800 fresh boards each, `bot-ladder.md`, The robustness gate for Expert). Partnered with Normal, Expert's team beats Hard's by +0.78% [−0.80, 2.35] equity and +9.2k [0.6, 17.8] points per hand (`xb16`); partnered with Easy, +0.68% [−1.12, 2.48] and +15.3k [4.8, 25.9] (`xb17`). Against a passive bidder Expert gains +4.39% where Hard gains +2.42% (`xb18`); against Normal, +14.32% where Hard gains +11.59% (`xb19`).
- **The final Expert against Expert‑0** (a fixed 1500 fresh boards, `xb21`): **+1.36% [0.10, 2.62]** equity and **+13.6k [6.6, 20.6]** points per hand. The promoted steps sum to about +2.7% equity, just above this interval, and +16.3k points, inside it: steps promoted on noisy estimates are biased upward. Measured through Hard, the difference is +2.55% [0.97, 4.13].
- **Expert is offered at the table**, after Hard in the lobby's level picker, with a 5 s reply time (`multiplayer.md`).
- **The load test: one server with its default 4 bot workers carries 32 rooms of four Expert bots** with no late answers (p99 1.6 s, request to answer). From 48 rooms decisions queue; answers still come inside the 5 s reply time, but queued decisions search for less time. 64 rooms of four Hard bots ran with no late answer either, far from their limit (`bot-ladder.md`, Timing).
- **How the runs are driven:** a job runner in the session scratchpad takes commands one at a time from a jobs file; each experiment runs from a frozen detached checkout of the branch, so edits cannot reach a running experiment. If the session is lost, rerun the queued experiments from the commands in this section and `bot-ladder.md`.

## Status of the strong bots before the Expert work (2026‑11‑16)

- **Hard is offered at the table** next to Easy and Normal. Its first version beat Normal by +8.6% match equity per board (+54k points per hand). It has since gained three promoted improvements:
  - it never raises over its partner's bid;
  - it bids on a calibrated estimate, which was the largest single gain;
  - its card play weights the sampled deals by the specials evidence (who passed up a chance to play the Tiger, Bull or Bear): +4.3k points per hand.

  Under the current rules (the player to the bidder's left leads the first trick) and defaults, it beats Normal by +12.7% [11.0, 14.4] match equity per board and +66k points per hand, over 800 fixed boards (`bot-ladder.md`). An earlier 200‑board SPRT run had shown +15.0%, an estimate biased upward by the early stop.

  It runs on server worker threads with a 1.5 s reply time. Its card‑play budget (2.5M nodes) keeps decisions under the 1.3 s deadline on the dev machine (p99 0.7–0.8 s; the slowest of about 7,800 took 1.1–1.3 s), at no measurable cost in strength.
- **Expert is simulator‑only.** It is Hard with a bigger budget.
  - **It now fits its 5 s reply time** (2026‑11‑23): `nodes` 8M and `refineNodes` 24M bring every decision kind's p99 to 3.0 s or less on the dev machine with 4 workers (`bot-ladder.md`, Timing). These settings are frozen as the spec `expert0` (Expert‑0).
  - It has not yet been measured against the current Hard. Against the earlier Hard it gained +8.4k points per hand (its equity gain was not significant).
- **Open‑ended tuning is paused.** The items below are what remains.

## The original plan, and how far it got

The plan was search‑centred: an exact open‑hand solver, sampling of hidden cards (weighted by inference), PIMC card play, then αμ or recursive PIMC, learned models for contract decisions and early‑hand evaluation, and rigorous duplicate testing throughout. Training was to be in Python (PyTorch), with models exported to TypeScript.

| Phase | Goal | Status |
|---|---|---|
| 0 | Measurement: duplicate boards, SPRT, ladder, match‑equity table | Done; common random numbers added |
| 1 | Fast play state, open‑hand solver, oracle; decide on Rust | Done; the search stays in TypeScript (`bot-design.md`, Performance) |
| 2 | Belief sampler and PIMC card play | Done; Hard beat Normal |
| 3 | Contract decisions by search and models | Search done, plus calibration. Expert bids with a learned contract‑value model and a fitted bidding model |
| 4 | Match equity as the objective | Contract decisions use it. Card play stays in points: equity play lost |
| 5 | Inference | Auction, trump and throw‑off weighting: no gain. Specials inference: a small gain, promoted. Expert adds a learned card‑play policy model and auction weighting under the fitted bidding model |
| 6 | Beyond PIMC (αμ, recursive PIMC, ISMCTS) → Expert | Not built: the headroom left by PIMC's own flaws is under 0.5% (`bot-ladder.md`, Headroom). Expert is a bigger budget with better inputs |
| 7 | Learned evaluation, expert iteration | Not started. Python has no numpy or torch on the dev machine |
| 8 | Production: worker pool, fixed delays, deadline, load test | Done: one server with 4 bot workers carries 32 rooms of Expert bots and more than 64 rooms of Hard bots |
| 9 | Research track (mini‑game lab, self‑play learning) | Not started |

## What we learned

1. **Card play is saturated on search budget.** Three times the nodes, or one trick deeper, gained nothing measurable. More worlds in the endgame gained nothing either.
2. **The remaining card‑play gap is information.** Hard with an all‑seeing oracle playing for it gains:

   | Oracle plays | Points per hand |
   |---|---|
   | the last 4 tricks | +25k |
   | the last 7 tricks | +67k |
   | every trick | +129k |

   About 21k of the full gap is just knowing where the Tiger, Bull and Bear are, mostly in the first six tricks. Some of the gap is information no real player has, and some is PIMC's own flaws (strategy fusion; assuming every player can see every hand). The diagnostics so far do not separate those two parts.
3. **Bidding is the weakest component.**
   - The greedy‑playout estimate predicts what the bidder captures poorly (r = 0.48) and badly understates weak hands. Calibrating it won about +5.7% equity per board.
   - Even calibrated, the bid‑or‑pass choice does not depend on the bot's own hand strength: declaring and passing come out within about 0.01 equity of each other.
   - Playing about 1,200 bid decisions both ways showed that the bot's estimated advantage has no predictive value (r = −0.015). It also showed that, against calibrated opponents, one bid more or less is worth about nothing on average.
   - Each paired rollout's noise is large (25.7% equity), so tuning bidding from rollouts would need far more data. Duplicate A/B runs of whole policies remain the reliable test.
4. **The opening lead is a handicap.** Since the first lead moved from the bidder to the player on their left, the bidding team captures about $16k more per hand ($252k against $236k, same bot, other deals). Greedy playouts of the same 20,000 deals from both leaders give the same answer: +$16.1k [15.4, 16.8] when the opponent leads. The calibration of the bidding estimate did not change, because the estimate rose by as much as the capture.
5. **The match‑equity table is noisy.**
   - Two 20,000‑game tables built under the same rules with different seeds differ by 1.6% equity per cell on average over scores of $0–900k. For example, ME(800k, 600k, opponents deal) is 76% in one and 81% in the other.
   - The old‑rule table differs from a new‑rule one by the same 1.6%, so the first‑lead rule's effect could not be seen, and the table was kept.
   - A bigger table (say 200,000 games, about 25 minutes) would cut the noise by about two thirds. Any new table changes every equity decision, so test it by duplicate A/B before adopting it.
6. **Statistics lessons** (`bot-ladder.md`, notes 4, 6 and 9):
   - Promote only after a win on boards the change was not selected on.
   - The SPRT's estimate at its stopping point is biased toward its verdict, so measure small effects on a fixed number of boards (`SPRT=0`).
   - The SPRT must not stop before 200 boards.
   - Common random numbers narrow confidence intervals by about 12%.

## What is left

### To finish (concrete)

1. **Load‑test on the production host size.** On the dev machine one server with 4 bot workers carries 32 rooms of four Expert bots and more than 64 rooms of four Hard bots without a late answer (`bot-ladder.md`, Timing). The deploy branch's host (`shared-cpu-1x`) gives the server one bot worker, which the Expert bots and the solo analysis would share.
2. **Carry Expert's gains to Hard**, if wanted: policy inference and auction inference each cost Expert about 10% more card‑play time, which Hard's p99 (0.7–0.8 s against its 1.3 s deadline) should absorb, and the bidding models make a bid about 15 ms slower. Auction inference helps only with the fitted bidding model (`ceilingModel: 'fitted'`); with Hard's heuristic ceilings it was rejected. Each change would need its own duplicate tests at Hard's budget and a new golden test.

### Done: solo analysis on Expert (2026‑11‑24)

The solo analysis searches with Expert's settings (`ANALYSIS_DEFAULTS`), so its hints and grades value each choice as Expert would, with Expert's card‑play inference and contract values. A decision costs it what it costs an Expert bot, so `analysisMs` is Expert's 4.8 s deadline, still only a safety net (`bot-ladder.md`, Timing). It picks the same best choice as Hard's analysis in 74% of decisions.

### Done since the pause: specials inference

Promoted on 2026‑11‑16. Hard now sets `inferencePool: 6`, `auctionInference: false` and `specialsInference: true`.
- Two fixed 1500‑board runs under the current rule (seeds `exp21`, `exp22`) gave +0.44% and +0.61% equity per board, pooled +0.53% [−0.12, 1.17] and **+4.1k [0.7, 7.6]** points per hand. With the earlier old‑rule fixed run: +0.63% [0.12, 1.15], +4.3k [1.6, 7.1] (`bot-ladder.md`, note 10).
- Decision times stay inside the deadline (`bot-ladder.md`, Timing).
- Refit the model (`scripts/specials-model.ts`) whenever card play or the rules change, because it models the bots' own play.

### Done since the pause: the first‑lead rule

`docs/game-rules.md` now says the player to the left of the highest bidder leads the first trick. The engine had given the lead to the bidder.
- The rule is one engine helper, `openingLeader` (`packages/engine/src/tricks.ts`). An engine invariant checks it in the random‑game tests and the simulator's legality checks.
- The bots' contract code had assumed the bidder leads, in the greedy playout (`playoutWith`) and in the discard/trump re‑check (`bestCandidate`). Both now call `openingLeader`, and a test checks that the playout starts where the engine does. Card play reads the turn from the observation, so it needed no change.
- **Bidding calibration:** refitted and unchanged (`bot-ladder.md`, Calibration), so the defaults stay.
- **Match‑equity table:** kept; the rule's effect is smaller than the table's sampling noise (What we learned, above).
- **Specials model:** refitted (1200 hands, 9642 opportunities). It is off by default, so play did not change.
- **Checks:** Hard beat Normal by +15.0% per board under the new rule in a 200‑board SPRT run (`bot-ladder.md`; a fixed 800‑board run later gave +12.7%), and its decision times barely changed (p99 792 ms, `bot-ladder.md`, Timing).

### Research directions (bigger, uncertain)

In rough order of expected value:

1. **A better bidding evaluation.** Today the bid choice is close to a coin flip. Options:
   - a learned contract‑value model, trained on solver "par" values and calibrated to real play;
   - an auction model that matches how the bots really bid (the fit in `bot-ladder.md`, Bidding diagnostics, shows the heuristic's ceilings do not);
   - valuing the effect of a bid on the rest of the auction, which today assumes bidding wins the contract at the minimum.

   Test any change by duplicate A/B against the current Hard, and against a passive opponent: calibration's gain came from exploiting passive bidders.
2. **Inference from all card play.** Generalise the specials model into a policy model of every play: P(card | situation) fitted on self‑play, used to weight worlds. That is the "policy‑based inference" of Rebstock et al. (2019). The information gap above is the prize.
3. **αμ for the bot's own team, and recursive PIMC near the end of a hand**, against PIMC's two flaws. Measure with the hybrid diagnostics.
4. **A learned leaf evaluation** to replace the greedy playout in depth‑limited search (the playout is also what makes the bidding estimate weak).
5. **Robustness with humans.** Test Hard partnered with and against Easy and Normal (stand‑ins for humans), since the bidding is now aggressive.

## How to resume

**Toolchain.** See `CLAUDE.md`. In a worktree, put the nvm Node 24 `bin` directory on `PATH`. Before merging, run `pnpm check`, plus `pnpm e2e` for client or protocol changes.

**The experiment loop.**
1. Diagnose first, with the scripts below.
2. Add one change as an option, off by default.
3. Test it on **fresh boards** (a new `SEED`):
   ```
   BOARDS=1200 SEED=exp19 WORKERS=20 pnpm --dir packages/sim exec tsx scripts/experiments.ts out.jsonl "hard:myOption=1|hard"
   ```
   - The SPRT (δ = 1% equity) stops after at least 200 boards.
   - Effects under about 1% need a fixed run: `SPRT=0 BOARDS=1500`.
4. Replicate an H1 on another fresh seed before promoting.
5. Promote by changing the default, and update the settings table in `bot-design.md` and the ladder in `bot-ladder.md`. Record rejected ideas too.

**Seeds already used.** Use new ones, so that no change is selected and confirmed on the same boards:
- experiment boards: `exp` and `exp1`–`exp23`;
- calibration: `calibrate`, `calibrate2`, `calibrate4`, `calibrate5`;
- other: `specials`, `bid-rollouts`, `bid-diagnostic`, `timing`, `timing-x`, `timing-hard`, `timing-lead`, `me-table-noise`;
- the Expert work (family `xb`): timing `timing-xb0`, `timing-xb1` (the decision bank), `timing-xb2`; Expert‑0 vs Hard `xb1`; the Phase 2 headroom boards `xb2`; Phase 3 screens `xb3` (policy inference), `xb4` (contract‑value model), `xb5` (auction model, on top of the contract‑value model), `xb6` (unused), `xb7` (the contract‑value model's fixed confirmation), `xb8` (`bidOutcome`, on top of the contract‑value model), `xb9` (the contract‑value model's second fixed run), `xb10`, `xb11` (the bidding package against Expert‑0), `xb12` (`auctionInference`, on top of policy inference), `xb13` (policy inference's replication, on top of the bidding package); the final Expert against Hard `xb14`, `xb15`; the robustness gate `xb16` (partnered with Normal), `xb17` (with Easy), `xb18` (Expert and Hard each against a passive bidder), `xb19` (Expert and Hard each against Normal); `xb20` (`auctionInference`'s replication, on top of policy inference); `xb21` (the final Expert against Expert‑0); regret `xb-regret1`; contract data `xb-cvm1`, `xb-cvm2`; play data `xb-policy1`; smoke tests `cvm-smoke`.

**Run times** (24 cores):
- Hard vs Hard over 1200 boards: about 45–60 minutes on all cores.
- Expert costs about 3.7× Hard.
- A 1000‑hand calibration: about 13 minutes on 22 workers (300 hands: about 15 minutes on 4).
- Hard vs Normal, stopping at 200 boards: about 6 minutes on 12 workers.
- Hard vs Normal over 800 fixed boards: about 12 minutes on 22 workers.
- The match‑equity table (20,000 Normal games): about 2.5 minutes on all cores.

**Simulator specs.**
- `hard`, `expert`, `expert0` (Expert‑0, frozen), `normal`, `easy`, `oracle`.
- Any Hard option, for example `hard:worlds=20,raisePartner=1`. The diagnostics below take `base=hard|expert|expert0` (default `hard`) for the bot they modify.
- `hybrid:last=N`: Hard, with the oracle playing the last N tricks.
- `hindsight:kinds=bid+discard+trump`: the base, except that those contract decisions are made in hindsight. Each candidate (pass or the minimum bid, a misdeal; the best few discards by a greedy playout of the true deal; each trump) is applied to the true state and the hand is played out by the bots at the table with the simulator's own random streams, so its realised equity is known exactly. Its margin over its base bounds what better decisions of that kind could gain.
- `rollout:last=N,worlds=W`: the base, except that with N (default 3) or fewer tricks left it values each card by playing the hand out with the base in all four seats over W (default 16) worlds sampled as the base samples them, instead of solving each world with all hands open. Same information, a realistic model of the play to come: its margin over the base is what better search could gain there, against `hybrid:last=N` for the whole gap.
- `peek:cards=bull+bear+tiger,last=N`: Hard whose worlds put those cards where they really are. Groups (joined by `+`): `tiger`, `bull`, `bear`, `money`, `trumps`, `partner`, `lho`, `rho` (a whole hand), `pile` (the discards) and `all` (the true deal). Worlds are sampled exactly, conditioned on the revealed placements (`buildBelief` pins, simulator only), and keep the base's specials weighting.

**Scripts** (`packages/sim/scripts/`, run with `pnpm --dir packages/sim exec tsx scripts/<name>.ts`):

| Script | What it does |
|---|---|
| `experiments.ts` | Duplicate A/B runs with SPRT (or fixed with `SPRT=0`); appends JSON lines. `"A&P|B&Q"` seats A with partner P against B with partner Q (the robustness gate: a strong bot partnered with Normal or Easy) |
| `timing.ts` | Decision‑time percentiles by decision kind and cards left; size budgets against the reply time |
| `timing-bank.ts` | A decision bank: `collect` stores the observations (and, for diagnostics, the true hands) of self‑play hands; `time` runs any spec on them, kind by kind, with percentiles, the slowest positions, and with `REGRET=1` each card's regret against the true deal solved exactly. Gives the rare decisions (discard, trump) enough samples for a real p99 |
| `contract-data.ts` | Plays self‑play hands and writes each contract with its whole deal, auction, choices and capture as JSON lines; `FORCED=1` scripts the auction so that a random seat declares, so the data covers every kind of hand, not only auction winners |
| `contract-model.ts` | Fits the linear contract‑value model (`contract/value.ts` features) on that data and compares it, on held‑out contracts, with the calibrated playout: correlation, RMSE, make/set log loss; `WRITE=1` writes `contract/generated/contractModel.ts` |
| `auction-model.ts` | Fits the model of how the bots really bid (`contract/auction.ts`) on natural contract data: P(bid | the seat's 13 cards, price), leaving out forced openings and turns with partner high; held‑out log loss against the heuristic ceilings; `WRITE=1` writes `contract/generated/auctionModel.ts` |
| `policy-model.ts` | Fits the card‑play policy model for policy‑based inference from a bank collected with actions; held‑out log‑likelihood per play against uniform, top‑1 accuracy; `WRITE=1` writes `inference/generated/policyModel.ts` |
| `inference-eval.ts` | How well world weighting finds the true holdings, on banked plays: the weighted pool's log‑probability of each unseen card's true holder (overall, money, specials, by stage) and the effective sample size, for uniform, specials, policy, both, and the auction's evidence by the heuristic or fitted bidding model |
| `regret.ts` | Where card play loses against the all‑seeing solver: each chosen card's regret against the best card in the true deal, by trick, position in the trick and side (declaring or defending) |
| `compare-bank.ts` | Pairs two `timing-bank.ts time` results on one bank: how often the choices agree, the time of each, and the mean regret difference with a 95% interval (a cheap offline screen before a duplicate run) |
| `discard-dd.ts` | Pairs two specs' discards on a bank with true hands (`timing-bank.ts time … discard` results): each discard's best‑trump open‑hand value on the true deal, searched `DEPTH` tricks deep plus the greedy playout; the mean difference with a 95% interval |
| `calibrate.ts` | Bidding estimate vs actual capture, by bid, margin and auction shape; prints the calibration fit |
| `specials-model.ts` | Fits the specials inference model and writes `inference/generated/specialsModel.ts` |
| `bid-diagnostic.ts` | Bid rate and the bot's own evaluation, by hand strength (auctions only, fast) |
| `bid-rollouts.ts` | Plays sampled bid decisions both ways; does the estimate predict the realised advantage? |
| `slow-decisions.ts` | Finds decisions slower than a threshold |
| `profile-lead.ts` | PIMC timing on opening leads |
| `me-monotone.ts` | Checks the match‑equity table is monotone and symmetric |
| `placeholder-me-table.ts` | Writes a data‑free match‑equity table (bootstrap only) |

`pnpm sim` also has `tournament`, `duplicate`, `match`, `me-table`, `bench`, `invariants` and `replay`. The solver benchmarks are in `packages/search/bench/`.

**Generated data, and when to regenerate it:**

| Data | File | Regenerate with | When |
|---|---|---|---|
| Match‑equity table | `packages/search/src/generated/meTable.ts` | `pnpm sim me-table` | after scoring‑rule changes. Its sampling noise (1.6% per cell) hid the first‑lead rule's effect, so it was not rebuilt for that change |
| Specials model | `packages/bots/src/inference/generated/specialsModel.ts` | `scripts/specials-model.ts hard 1200` | after card‑play or rule changes |
| Bidding calibration | `calibA`, `calibB`, `calibSd` in `contract/index.ts` | `scripts/calibrate.ts hard 1000` (prints the fit) | after bidding, playout or rule changes. Refits on calibrated play, before and after the first‑lead rule change, gave nearly the same values as the defaults |
