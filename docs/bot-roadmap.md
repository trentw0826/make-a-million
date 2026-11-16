# Strong Bots – Status and Roadmap

Where the work on the strong bots stands, what was learned, what is left, and how to pick it up. How the bots work is in `bot-design.md`; every measured result is in `bot-ladder.md`.

## Status (2026‑11‑15)

- **Hard is offered at the table** next to Easy and Normal. It beats Normal by +8.6% match equity per board (+54k points per hand), and has since gained two promoted improvements:
  - it never raises over its partner's bid;
  - it bids on a calibrated estimate, which was the largest single gain.

  It runs on server worker threads with a 1.5 s reply time. Its card‑play budget (2.5M nodes) keeps every decision under the 1.3 s deadline on the dev machine, at no measurable cost in strength.
- **Expert is simulator‑only.** It is Hard with about three times the budget. Two things keep it from the table:
  - its slowest decisions take far longer than its 5 s reply time;
  - it has not been measured against the current Hard. Against the earlier Hard it gained +8.4k points per hand (its equity gain was not significant).
- **Open‑ended tuning is paused.** The items below are what remains.

## The original plan, and how far it got

The plan was search‑centred: an exact open‑hand solver, sampling of hidden cards (weighted by inference), PIMC card play, then αμ or recursive PIMC, learned models for contract decisions and early‑hand evaluation, and rigorous duplicate testing throughout. Training was to be in Python (PyTorch), with models exported to TypeScript.

| Phase | Goal | Status |
|---|---|---|
| 0 | Measurement: duplicate boards, SPRT, ladder, match‑equity table | Done; common random numbers added |
| 1 | Fast play state, open‑hand solver, oracle; decide on Rust | Done; the search stays in TypeScript (`bot-design.md`, Performance) |
| 2 | Belief sampler and PIMC card play | Done; Hard beat Normal |
| 3 | Contract decisions by search and models | Search done, plus calibration. A learned contract‑value model was not built |
| 4 | Match equity as the objective | Contract decisions use it. Card play stays in points: equity play lost |
| 5 | Inference | Auction, trump and throw‑off weighting: no gain. Specials inference: promising, not promoted. A learned policy model was not built |
| 6 | Beyond PIMC (αμ, recursive PIMC, ISMCTS) → Expert | Not started. Expert so far is only a bigger budget |
| 7 | Learned evaluation, expert iteration | Not started. Python has no numpy or torch on the dev machine |
| 8 | Production: worker pool, fixed delays, deadline, load test | Done for Hard, except a load test with many rooms |
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
4. **Statistics lessons** (`bot-ladder.md`, notes 4, 6 and 9):
   - Promote only after a win on boards the change was not selected on.
   - The SPRT's estimate at its stopping point is biased toward its verdict, so measure small effects on a fixed number of boards (`SPRT=0`).
   - The SPRT must not stop before 200 boards.
   - Common random numbers narrow confidence intervals by about 12%.

## What is left

### To finish (concrete)

1. **Expert's time budget, then a fresh test.** On a loaded machine its slowest decisions were:
   - discard 3.3 s on average and up to 9.6 s;
   - trump up to 7.5 s;
   - card play with 21–28 cards left, p99 10.6 s.

   The re‑check (24 deals × 5 candidates, two tricks deep) and exact solves seven tricks out dominate.
   1. Set `refineNodes` and lower `nodes` / `exactTricks` until `scripts/timing.ts expert` shows p99 under about 4.5 s on an idle machine.
   2. Run a fixed‑board test against the current Hard.
   3. If Expert is clearly stronger, re‑enable it in one commit:
      - `DifficultySchema` in `packages/protocol/src/index.ts`;
      - `botDelayMs` in `apps/server/src/config.ts`;
      - `DIFFICULTY_LABELS` and `DIFFICULTY_ORDER` in `apps/client/src/format.ts`;
      - the level list in `docs/multiplayer.md` and `docs/architecture.md`;
      - the "no Expert" check in `apps/client/e2e/smoke.ts`.
2. **Decide on specials inference.**
   - Runs so far: +1.66% (629 boards, H1), −1.66% (407 boards, H0), and a fixed 1500‑board run at +0.82% [−0.03, 1.68] equity per board, +4.6k [0.1, 9.1] points per hand. That is probably a small real gain.
   - To promote it, set `inferencePool: 6`, `auctionInference: false` and `specialsInference: true` in `HARD_DEFAULTS`.
   - Refit the model (`scripts/specials-model.ts`) whenever card play changes, because it models the bots' own play.
3. **Pending rule change: who leads the first trick.** `docs/game-rules.md` on `main` now says the player to the left of the highest bidder leads; the engine still has the bidder lead. When the engine changes:
   - In the bots, the first leader is assumed in `packages/bots/src/contract/simulate.ts` (`playoutWith`: `turn: declarer`) and in `packages/bots/src/contract/index.ts` (`bestCandidate`'s re‑check: `turn: obs.seat`). Both become the seat after the bidder.
   - Card play itself reads the turn from the observation, so it follows the engine automatically.
   - Then refit the calibration (`scripts/calibrate.ts`), refit the specials model, and re‑run Hard vs Normal for the ladder.
4. **Load test** the server with several rooms of Hard bots on the production host size. Watch the `bot answered after its deadline` warnings.

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
- experiment boards: `exp` and `exp1`–`exp19`;
- calibration: `calibrate`, `calibrate2`, `calibrate4`;
- other: `specials`, `bid-rollouts`, `bid-diagnostic`, `timing`, `timing-x`, `timing-hard`.

**Run times** (24 cores):
- Hard vs Hard over 1200 boards: about 45–60 minutes on all cores.
- Expert costs about 3.7× Hard.
- A 300‑hand calibration: about 15 minutes on 4 workers.

**Simulator specs.**
- `hard`, `expert`, `normal`, `easy`, `oracle`.
- Any Hard option, for example `hard:worlds=20,raisePartner=1`.
- `hybrid:last=N`: Hard, with the oracle playing the last N tricks.
- `peek:cards=bull+bear+tiger,last=N`: Hard whose worlds put those cards where they really are.

**Scripts** (`packages/sim/scripts/`, run with `pnpm --dir packages/sim exec tsx scripts/<name>.ts`):

| Script | What it does |
|---|---|
| `experiments.ts` | Duplicate A/B runs with SPRT (or fixed with `SPRT=0`); appends JSON lines |
| `timing.ts` | Decision‑time percentiles by decision kind and cards left; size budgets against the reply time |
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
| Match‑equity table | `packages/search/src/generated/meTable.ts` | `pnpm sim me-table` | after scoring‑rule changes |
| Specials model | `packages/bots/src/inference/generated/specialsModel.ts` | `scripts/specials-model.ts hard 1200` | after card‑play or rule changes |
| Bidding calibration | `calibA`, `calibB`, `calibSd` in `contract/index.ts` | `scripts/calibrate.ts hard 400` (prints the fit) | after bidding, playout or rule changes; a refit on calibrated play gave nearly the same values |
