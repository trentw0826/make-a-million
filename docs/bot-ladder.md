# Bot Ladder

Every bot change is measured before it is kept. This page records the results, including the ideas that did not help.

## How results are measured

- **Duplicate boards** (`pnpm sim duplicate --a X --b Y`): each deal is played twice, at a realistic score taken from self-play, with the two bots swapping seats. Because both bots play the same cards, luck cancels out. The score is A's **match‑equity** gain per board (the change in A's probability of winning the game, summed over both seatings), with a 95% confidence interval. A's points gain per hand is shown alongside.
- **SPRT** (`--sprt --delta D`): a sequential test that stops as soon as the evidence shows that A is at least D better (H1), or not better (H0).
- **Full matches** (`pnpm sim match`): complete games in duplicate pairs, giving A's win rate.
- **Oracle:** a simulator‑only bot that sees every hand. Its margin over a real bot shows how much there is still to gain.

## Results

| Date | A | B | Boards | ΔME per board (95% CI) | Δpoints per hand | Verdict |
|---|---|---|---|---|---|---|
| 2026‑11‑15 | normal | easy | 400 | +32.6% [30.0, 35.3] | +196.8k | Normal ≫ Easy |
| 2026‑11‑15 | oracle (sees all hands) | normal | 200 | +24.0% [20.9, 27.2] | +152.2k | headroom for card play |
| 2026‑11‑15 | hard‑v1 (PIMC play, heuristic contracts) | normal | 200 | +8.5% [5.8, 11.2] | +54.3k | **promoted** |
| 2026‑11‑15 | hard (search for misdeal, bid, discard, trump) | normal | 300 | +8.55% [5.94, 11.15] | +53.8k | **promoted** (current Hard) |
| 2026‑11‑15 | hard | hard with heuristic contracts | 600 | +1.18% [−0.56, 2.92] | −0.9k | inconclusive; search contracts kept |
| 2026‑11‑15 | hybrid: Hard, but the all‑seeing oracle plays the last 4 tricks | hard | 60 | +3.10% [1.27, 4.93] | +25.5k [12.4, 38.7] | headroom (SPRT H1). A made 54 of 60 contracts, B 50 |
| 2026‑11‑15 | hybrid, oracle plays the last 7 tricks | hard | 45 | +8.12% [4.99, 11.25] | +66.7k [43.5, 90.0] | headroom. A made 41 of 45, B 33 |
| 2026‑11‑15 | hybrid, oracle plays every trick | hard | 81 | +21.85% [16.63, 27.07] | +129.2k [105.9, 152.5] | headroom. A made 76 of 81, B 52 (note 7) |
| 2026‑11‑15 | peek: Hard whose worlds place the Tiger, Bull and Bear truly (all tricks) | hard | 216 | +3.34% [1.42, 5.27] | +20.9k [10.5, 31.4] | the most that inferring the specials could gain. A made 84.3%, B 79.6% |
| 2026‑11‑15 | peek at the specials in the last 7 tricks only | hard | 421 | +1.40% [0.33, 2.48] | +8.5k [3.2, 13.9] | most of the specials' value is in the first 6 tricks. (The bidding default changed during this run, for both sides alike) |
| 2026‑11‑15 | expert (≈3× Hard's budget, more worlds) | hard (both still raising partner) | 1200 | +1.12% [−0.20, 2.44] | **+8.4k [1.5, 15.2]** | SPRT continue (LLR 1.37). 777 / 209 ms mean, max 28 s. A: 1172 contracts, 77.5% made; B: 1228, 75.2% |
| 2026‑11‑15 | hard (current defaults: no partner raises, calibrated bidding), **first‑lead rule** (the player to the bidder's left leads) | normal | 200 | +15.02% [11.43, 18.62] | +73.1k [54.0, 92.1] | SPRT H1 (seed `exp20`). Hard won 264 of 400 contracts and made 89.4%; Normal won 136 and made 71.3%. Mean decision 327 ms, max 4.0 s on a loaded machine (the simulator sets no deadline) |
| 2026‑11‑23 | **expert0** (Expert‑0: Expert fitted to its 5 s reply time), **fixed 1500 fresh boards** (`SPRT=0`, seed `xb1`) | hard | 1500 | **+1.35% [0.05, 2.65]** | **+9.8k [2.6, 17.1]** | Expert‑0 is stronger than the current Hard; to be replicated on fresh boards before Expert is offered. A won 1432 of 3000 contracts and made 73.4%; B won 1568 and made 71.0%; mean bids $210k and $212k. Mean decision 688 / 170 ms on a busy machine (no deadline in the simulator; 61 minutes on 22 workers) |
| 2026‑11‑16 | hard (current defaults, now with specials inference), first‑lead rule, **fixed 800 fresh boards** (`SPRT=0`, seed `exp23`) | normal | 800 | **+12.70% [11.03, 14.37]** | **+65.9k [56.8, 75.1]** | the current measure of Hard against Normal. Lower than the 200‑board SPRT run above, whose estimate is biased upward by its stop (note 9); the two intervals overlap. Hard won 1000 of 1600 contracts and made 90.9%; Normal won 600 and made 75.3%. Mean decision 295 ms, max 3.8 s on a loaded machine (no deadline in the simulator) |

### Tuning experiments (A against the Hard defaults unless stated; SPRT δ = 1%)

| Date | Change in A | Boards | ΔME per board (95% CI) | Δpoints per hand | Mean decision time A / B | Verdict |
|---|---|---|---|---|---|---|
| 2026‑11‑15 | 3× node budget, 60 worlds | 600 | +0.50% [−0.89, 1.90] | +3.7k | 358 / 180 ms (max 9.7 s) | not worth 2× the time; rejected |
| 2026‑11‑15 | search 3 tricks deep (B: 3× budget, as above) | 600 | −0.10% [−1.59, 1.39] | −0.1k | 817 / 351 ms | rejected |
| 2026‑11‑15 | play for match equity, utility inside the search | 600 | −0.95% [−2.39, 0.50] | −11.1k | 211 / 183 ms | rejected: see note 1 |
| 2026‑11‑15 | weight worlds by the auction and trump choice (pool 6×) | 600 | −0.19% [−1.70, 1.31] | −1.8k | 189 / 178 ms | inconclusive; off |
| 2026‑11‑15 | greedy-playout tweak (leaf estimate) | 100 positions | no clear regret change | — | — | reverted |
| 2026‑11‑15 | `playUtility=margin` (made/set counts; applied at the root) | 1200 | +0.61% [−0.30, 1.52] | +0.2k | 207 / 210 ms | promising, free; needs more boards |
| 2026‑11‑15 | `playUtility=equity` (applied at the root) | 1080 | −0.31% [−1.32, 0.70] | −8.9k [−14.3, −3.4] | 183 / 183 ms | **H0**: rejected (note 3) |
| 2026‑11‑15 | `raisePartner=0` (never raise over partner) | 1200 | +0.99% [−0.12, 2.09] | **+10.4k [4.7, 16.0]** | 176 / — ms | strong; confirming on fresh boards. A: 1137 contracts, 79% made, mean bid $183k; B: 1263, 75%, $193k |
| 2026‑11‑15 | `bidMargin=0.01` (bid only if ≥ 1% equity better than passing) | 1200 | +0.63% [−0.01, 1.26] | **+6.6k [2.8, 10.3]** | 178 / — ms | strong; A: 1086 contracts, 77% made; B: 1314, 75%. Testing on top of `raisePartner=0` |
| 2026‑11‑15 | `auctionSigma=40000` (trust the bidding model half as much) | 1200 | +0.24% [−0.45, 0.93] | +1.6k [−1.5, 4.7] | 179 / — ms | leaning H0 (LLR −2.1); bidding barely changes; rejected |
| 2026‑11‑15 | `playUtility=margin`, **replication on fresh boards** | 491 | −0.71% [−1.95, 0.54] | — | 184 / — ms | **H0**: not promoted |
| 2026‑11‑15 | `bidMargin=0.01`, **replication on fresh boards** (per-decision RNG) | 585 | −0.03% [−0.86, 0.80] | +1.6k [−3.1, 6.3] | 183 / — ms | **H0**: not promoted. A: 540 contracts, 76.5% made; B: 630, 75.7% |
| 2026‑11‑15 | `raisePartner=0`, **replication on fresh boards** | 842 | −0.80% [−2.07, 0.48] | −1.8k [−8.8, 5.2] | 181 / — ms | **H0**. Pooled with the first run: about +0.25% and +5k per hand. Not promoted (note 4) |
| 2026‑11‑15 | `raisePartner=0`, the first run's boards again with per-decision RNG | 873 | +1.51% [0.38, 2.63] | — | 180 / — ms | H1, but on the boards it was selected on; fresh-board CRN run pending |
| 2026‑11‑15 | `raisePartner=0`, **fresh boards, per-decision RNG** | 1200 | +0.93% [0.04, 1.82] | **+8.9k [4.3, 13.5]** | — | A: 1129 contracts, 79.8% made, mean bid $182k; B: 1271, 76.2%, $191k. **Promoted** (note 5) |
| 2026‑11‑15 | `inferencePool=6,throwOffs=1` (weight worlds by auction, trump choice and throw-offs) | 822 | −0.46% [−1.59, 0.66] | — | 406 / — ms (machine shared) | **H0**: rejected |
| 2026‑11‑15 | `calibA=130,calibB=0.5,calibSd=58` (bid on the calibrated estimate; fit on the calibration hands, fresh boards) | 196 | **+7.35% [4.36, 10.34]** | **+26.0k [10.8, 41.2]** | 276 / — ms | **H1**. A won 310 of the 392 auctions and made 82.6% of them; B won 82, made 72.0% (note 8) |
| 2026‑11‑15 | the same calibration, **replication on fresh boards** | 400 | **+4.62% [2.30, 6.94]** | +12.0k [0.3, 23.6] | — | **H1**. A won 649 of 800 auctions, made 79.4%; B 151, 76.2%. Pooled: +5.7% [3.8, 7.5]. **Promoted** (now the default) |
| 2026‑11‑15 | `exactWorlds=400` (up to 400 worlds once solving is exact; against the calibrated default) | 42 | −0.84% [−2.16, 0.47] | −6.2k [−15.1, 2.6] | 316 / 177 ms | **H0**: endgame sampling noise is not where Hard loses; rejected |
| 2026‑11‑15 | `calibScreen=1` (calibrate the discard/trump screening playouts too) | 36 | −0.21% [−1.14, 0.73] | +1.9k [−16.4, 20.2] | 175 / — ms | **H0** (stopped at 36 boards, before the 200‑board minimum existed; the CI still excludes +1%); rejected |
| 2026‑11‑15 | `inferencePool=6,auctionInference=0,specialsInference=1` (weight worlds by passed‑up chances to play the Tiger, Bull or Bear; model fitted on separate hands) | 629 | **+1.66% [0.45, 2.88]** | **+12.0k [5.1, 18.8]** | 124 / 122 ms | **H1**: about 57% of the `peek` ceiling. A made 76.6%, B 71.7% |
| 2026‑11‑15 | the same specials inference, **replication on fresh boards** | 407 | −1.66% [−3.32, 0.00] | −6.2k [−14.2, 1.7] | 182 / 177 ms | **H0**. Pooled with the first run: +0.5% [−0.5, 1.5], +4.2k [−1.0, 9.4]. Not promoted (note 9) |
| 2026‑11‑15 | the same specials inference, **fixed 1500 fresh boards** (`SPRT=0`) | 1500 | +0.82% [−0.03, 1.68] | **+4.6k [0.1, 9.1]** | 169 / 166 ms | probably a small real gain; awaiting a decision (`bot-roadmap.md`). A made 72.9%, B 71.3% |
| 2026‑11‑16 | the same specials inference, **fixed 1500 fresh boards under the first‑lead rule** (`SPRT=0`, seed `exp21`, refitted model) | 1500 | +0.44% [−0.47, 1.36] | +3.6k [−1.3, 8.5] | 268 / 260 ms | not significant alone. Pooled with the previous fixed run (note 10): +0.64% [0.02, 1.27], +4.2k [0.8, 7.5]. A made 73.1%, B 71.5% |
| 2026‑11‑16 | the same, **second fixed 1500 fresh boards under the first‑lead rule** (`SPRT=0`, seed `exp22`) | 1500 | +0.61% [−0.30, 1.52] | +4.7k [−0.3, 9.6] | 266 / 258 ms | not significant alone. Pooled with `exp21` (note 10): +0.53% [−0.12, 1.17], **+4.1k [0.7, 7.6]**. A made 70.9%, B 70.1% |
| 2026‑11‑15 | `nodes=2500000,worldNodes=250000` (smaller card‑play budget, to fit the 1.3 s deadline; fixed 1200 fresh boards) | 1200 | −0.10% [−1.01, 0.81] | +0.4k [−4.6, 5.3] | 275 / 341 ms (machine shared) | no measurable loss; **adopted** as Hard's budget (see Timing) |

Notes:
1. A utility that depends on money already won ties each solved position to that money, so the cache is far less effective: exact six‑trick solves cost about 3× as many nodes (`packages/search/bench/utility.ts`), and 23% of them overflowed the per‑world node cap and dropped to depth‑limited estimates. A made fewer contracts (446 vs 457 of 600). Hence `fastUtility` (now the default for `playUtility=margin|equity`): solve in points, then apply the utility to each root move's value, which is exact once no Bull or Bear can change the money still out.
2. More nodes and more depth buy almost nothing at Hard's budget: card play by PIMC is saturated, so the remaining gains must come from elsewhere (better leaf estimates early in the hand, inference, PIMC's strategy-fusion flaw, contract decisions).
3. Equity play made fewer contracts (809 vs 829) and lost points without gaining equity, although equity is what the boards are scored in. The table is not to blame (monotone and symmetric: `packages/sim/scripts/me-monotone.ts`). The likely cause is PIMC itself: every world is solved with all hands open, so it is over-confident about making or setting the contract exactly, and a steep utility amplifies that over-confidence where points dampen it.

4. Selection bias: `raisePartner`, `bidMargin` and `auctionSigma` were run on the same 1200 boards and the best was picked, which inflates it. The replication on fresh boards found nothing. **Rule from now on: a change is promoted only after it wins on boards it was not selected on.**
5. `raisePartner=0` on the two fresh board sets (842 and 1200 boards), pooled by inverse variance: ΔME +0.36% [−0.37, 1.09], Δpoints **+5.7k [1.8, 9.5]** per hand. Promoted to the default (`raisePartner: false`) because the points gain is clear on unselected boards, the equity gain is positive, it costs nothing (it saves a search), and the calibration explains it (partner-raise auctions were made 66% of the time). Its equity gain alone is not yet significant.
6. Per-decision RNG (common random numbers, `packages/sim/src/runner.ts`) narrowed the CI for the same boards and change by about 12% (±1.13% at 873 boards against about ±1.29%).
7. The hybrids (`hybrid:last=N`) keep Hard's contracts and replace its card play in the last N tricks with the oracle's. The gain is spread over the whole hand, about 10k per trick: the last 4 tricks are worth 25k, tricks 7–9 another 41k, the first 6 tricks another 62k. It is an upper bound that mixes two things: what seeing the cards is worth, which no real player has, and PIMC's own errors (strategy fusion, assuming that every other player can see every hand). The `peek` diagnostic separates part of the first: Hard's own search with only the named cards placed where they really are.
8. The bidding's playout estimate badly understates weak hands (see Calibration: an estimate of $80k averages $181k in real play), so uncalibrated Hard passes hands it would make. With the calibration it bids far more often and still makes more of its contracts. Refitting on 300 hands of calibrated self‑play gives nearly the same fit (a = 132k, b = 0.46, SD 56k), so the parameters are close to their fixed point.
9. The SPRT stops when its evidence crosses a boundary, so the estimate at the stop is biased toward the verdict: up after an H1, down after an H0. The two specials runs differ by about three standard errors, partly for that reason. Before promoting a small effect, measure it on a fixed number of boards (`SPRT=0`).
10. Specials inference on its fixed, unselected runs (1500 boards each), pooled by inverse variance. Under the current first‑lead rule with the refitted model (`exp21`, `exp22`): ΔME +0.53% [−0.12, 1.17], Δpoints **+4.1k [0.7, 7.6]** per hand. With the old‑rule fixed run as well: ΔME +0.63% [0.12, 1.15], Δpoints +4.3k [1.6, 7.1]. All three point estimates are positive (+0.82%, +0.44%, +0.61%). It costs about 3% more decision time (about 267 against 258 ms on average; the same maximum). **Promoted** (2026‑11‑16) on the standard of note 5: a clear points gain on unselected boards, a positive equity gain, and a small cost.

## Offline screens (the Expert work)

Cheap checks run before a duplicate test (`bot-roadmap.md`, Scripts).

**Policy‑based inference** (`policyInference`, `inference/policy.ts`). The card‑play model is a conditional logit with 30 hand‑crafted features, fitted on 16,495 Hard self‑play plays (seed `xb-policy1`). On held‑out hands its log‑likelihood is −1.137 per play, against −1.397 for uniform play over the legal cards; it picks the bot's card 54.4% of the time (24 features gave −1.175).

Inference quality on 1,883 banked plays of other hands (seed `timing-xb1`). The figure is the mean log‑probability that a 360‑world pool, weighted by each scheme, gives each unseen card's true holder (higher is better; the 24‑feature model):

| Weighting | all | money | specials | tricks 2–5 | 6–9 | 10–13 | ESS |
|---|---|---|---|---|---|---|---|
| uniform | −1.134 | −1.014 | −1.095 | −1.187 | −1.112 | −0.949 | 360 |
| specials (Hard today) | −1.133 | −1.014 | −1.069 | −1.186 | −1.110 | −0.943 | 342 |
| policy | −1.114 | −0.993 | −1.077 | −1.177 | −1.085 | −0.896 | 224 |
| both | −1.114 | −0.994 | −1.065 | −1.177 | −1.085 | −0.896 | 211 |

The policy model moves the truth's probability ten times as far as the specials model, which gained +4.1k points per hand in play, most of all late in the hand. But on 4,123 banked plays Expert‑0's true‑deal regret with it was 0.19k [−0.21, 0.60] per decision *higher* (not significant; 81% of cards unchanged). That metric cannot resolve a gain the size of the specials' (about 0.1k per decision), so the screen is inconclusive, not a failure. Next: a duplicate SPRT.

## Calibration (`packages/sim/scripts/calibrate.ts`)

Hard in all four seats, 300 hands (286 contracts), 2026‑11‑15:

- The bidding's playout estimate is **not** optimistic: estimate − actual capture is −18.0k [−25.5, −10.4] with the heuristic's discards and trump, −5.5k [−12.1, 1.2] with the contract as chosen.
- 78% of contracts are made. Bids up to $205k are made 75–86% of the time; bids of $215k or more only **43%** (42 contracts).
- By auction: forced $175k openings that everyone passes, 83% made (102); contested without a partner raise, 84% (93); auctions in which a player **raised over their own partner, 66%** (91, mean bid $209k). Raising partner is the clearest leak, hence the `raisePartner`, `bidMargin` and `auctionSigma` experiments. 39 of the 42 contracts at $215k or more came from auctions with a partner raise.

The same 300 hands after `raisePartner` was turned off (285 contracts):

- 80.7% made (was 78.0%); mean bid $182.8k (was $190.2k). Contracts at $215k or more: 15 (was 42), made 67% (was 43%). No auction has a partner raise.
- The estimate is still pessimistic: −20.3k [−28.2, −12.4] with the heuristic's contract, −13.6k [−20.9, −6.4] as chosen. It is also a weak predictor of the capture, even on the true deal: actual ≈ 126k + 0.52 × estimate (r = 0.48, residual SD 61k). Low estimates come out much better than predicted: contracts estimated $20–40k short were made 58% of the time. Of the contracts the estimate said would fail, 53 were made and 32 set.

Calibrated bidding (the new default) in all four seats, 300 fresh hands (287 contracts):

- Auctions are now mostly contested: 255 of 287 (was 138 of 285), mean bid $201k (was $183k), 72.8% made (was 80.7%). Each seat bids its weak hands, so contests go higher; in duplicate play against the uncalibrated bot this still won clearly.
- The bidding's model of the other players (`modelCeiling`, the heuristic's ceilings) still describes the old, timid bidding, so it underestimates how high calibrated opponents go when the bot passes. That model is the next candidate for refitting.

**Refit after the first‑lead rule change** (the player to the bidder's left now leads the first trick). Calibrated Hard in all four seats, 1000 fresh hands (seed `calibrate5`, 942 contracts), 2026‑11‑15:

- The bidding team now captures more: $252k on average, against about $236k for the same bot under the old rule (the 300 hands above and 400 more with seed `calibrate4`, on other deals). The playout estimate rose with it, to $243k from $222–228k. Not having to lead the first trick helps the declarer: greedy playouts of the same 20,000 deals from both leaders give the declaring team +$16.1k [15.4, 16.8] when the opponent leads. 73.7% of contracts made (was 71–73%), at a mean bid of $211k (was $201–204k).
- Fit: actual = 116.5k (±6.9) + 0.559 (±0.028) × estimate, residual SD 56.1k, r = 0.55. The same bot under the old rule (`calibrate4`, 382 contracts) gave 116.0k + 0.538 × estimate, so the rule did not change the calibration.
- Against the defaults (130k + 0.5 × estimate, SD 58k), the fit predicts within $5k for estimates of $150–300k (74% of contracts). It predicts $8k less at $100k (7% of contracts are below $150k) and $7k more at $350k. The defaults differ from this fit because they were fitted on uncalibrated play, not because of the rule. **They are kept**: so small a change could not be shown to help in an A/B run.

## Bidding diagnostics

- **The bid rate does not depend on hand strength** (`packages/sim/scripts/bid-diagnostic.ts`, 120–250 auctions per bot). Facing an opponent's standing bid, calibrated Hard bids 52–67% of the time in every band of its own playout estimate, and slightly more with its weakest hands. Uncalibrated Hard bid a flat 22–27%. The evaluation behind it barely separates the two choices: declaring and passing are worth within about 0.01 equity of each other in every band, and both rise with the hand. If Hard passes, its model expects the opponent to win the auction 71–87% of the time, at about $205k.
- **The model of the other players** cannot be fitted from the heuristic's hand ceilings: on 382 calibrated auctions the best fit gives the heuristic ceiling no weight at all (a flat ceiling of about $205k ± 45k). This follows from the first point, since calibrated bots bid nearly regardless of their hand.
- **Paired rollouts** (`packages/sim/scripts/bid-rollouts.ts`, 1196 decisions from 1500 hands): at one random optional bid decision per hand, the hand was played out after bidding the minimum and after passing, with common randomness.
  - On average, bidding was worth −0.06% [−1.51, 1.40] equity more than passing.
  - The bot's estimated advantage did not predict the realised one (r = −0.015, slope −0.06). Neither did the price, the scores or who the bot expected to win: every |r| was below 0.07.
  - The noise is large: the standard deviation of one pair's outcome difference is 25.7% equity (285k points), because a different auction changes the contract, trump and play.
  - Against calibrated opponents, one bid more or less is worth about nothing on average, and rollouts are too noisy to tune bidding. Whole‑policy duplicate runs remain the test.

## Timing (`packages/sim/scripts/timing.ts`)

Hard, 120 hands, 4 workers in parallel (as the server's pool), idle 24‑core machine, 2026‑11‑15:

| Decision | n | mean | p50 | p90 | p99 | max (ms) |
|---|---|---|---|---|---|---|
| all | 7764 | 138 | 48 | 413 | 1085 | 2356 |
| bid | 797 | 41 | 52 | 69 | 108 | 123 |
| discard | 120 | 131 | 129 | 163 | 219 | 236 |
| trump | 120 | 57 | 55 | 72 | 84 | 85 |
| play, more than one legal card | 4952 | 205 | 93 | 583 | 1285 | 2356 |
| play, 21–28 cards left | 792 | 372 | 194 | 990 | 2040 | 2356 |
| play, 13–20 cards left | 821 | 65 | 31 | 154 | 425 | 985 |

The slow decisions are the first exact solves, 6 tricks out, and the depth‑2 searches just before them. With the server's 1.3 s deadline (1.5 s reply time minus the 200 ms margin) about 0.6% of decisions would be cut short.

With the smaller budget now in `HARD_DEFAULTS` (`nodes` 2.5M, `worldNodes` 250k), same hands and machine: p99 782 ms overall; card play with more than one legal card p99 965 ms; 21–28 cards left p99 1116 ms; the slowest of 7764 decisions 1218 ms. The deadline should essentially never fire on hardware like this; a slower or busier host needs its own `timing.ts` run.

Under the first‑lead rule (seed `timing-lead`, 120 other hands, same machine idle apart from the desktop): p99 792 ms overall; card play with more than one legal card p99 969 ms; 21–28 cards left p99 1227 ms; the slowest of 7842 decisions 1307 ms, just past the 1.3 s deadline, which cuts it short well inside the 1.5 s reply time. The rule changes the profile very little.

With specials inference on (the same `timing-lead` hands, 4 workers, idle machine, 2026‑11‑16): p99 669 ms overall; card play with more than one legal card p99 840 ms; 21–28 cards left p99 1058 ms; the slowest of 7842 decisions 1102 ms, inside the deadline. The extra cost of weighting worlds is lost in the run‑to‑run variation.

Expert on a loaded machine (24 hands, 3 workers, while other experiments ran): p99 7.5 s overall; discard 3.3 s mean, 9.6 s max; trump up to 7.5 s; play with 21–28 cards left p99 10.6 s.

**Expert fitted to its 5 s reply time (Expert‑0), 2026‑11‑22/23.** Idle machine apart from the desktop, 4 workers. The dev machine's i7‑14650HX has 8 performance and 8 efficiency cores; a decision that lands on an efficiency core takes up to about twice as long, so budgets are sized for that.

- The old Expert budget on the idle machine (32 hands, seed `timing-xb0`): p99 2.7 s, max 3.2 s. The loaded‑machine figures above were mostly load. But a decision bank (`scripts/timing-bank.ts`, 400 Hard self‑play hands, seed `timing-xb1`) showed rare tails: discard p99 3.6 s, max 4.2 s; one trump 7.3 s; card play with 25–28 cards left up to 5.0 s.
- **Card play.** The slow plays are the first exact solves, 7 tricks out: they used the whole 12M‑node budget after 10–47 of the 60 worlds (about 5.6M nodes/s alone on a fast core). On all 1348 banked positions with 25–28 live cards, each card was scored against the true deal solved exactly (`REGRET=1`, paired by `scripts/compare-bank.ts`; regret in $1000s of margin per decision):

  | Expert variant vs | Same card | Regret A − B (95% CI) |
  |---|---|---|
  | exact from 7 tricks, 12M nodes vs exact from 6 | 72% | −0.40 [−1.00, 0.21] |
  | 12M vs 8M nodes | 94% | +0.35 [0.00, 0.70] |
  | 8M nodes, `worldNodes` 400k vs 8M, 1.2M | 79% | +0.61 [0.01, 1.20] |
  | Expert (12M) vs Hard | 67% | −0.81 [−1.52, −0.09] |

  Exact solving from 7 tricks helps a little; 8M nodes chose no worse than 12M; dropping to depth 2 sooner (`worldNodes` 400k) chose worse. Hence `nodes` 8M, the rest unchanged.
- **Discard and trump.** The re‑check had no node cap. With `refineNodes` 24M, 99.9% of the 800 banked discards and trumps are unchanged (12M changed 6% of discards) and the slowest takes 3.0 s.

Expert‑0 timing, 120 hands of self‑play (seed `timing-xb2`), plus the bank's rare decisions:

| Decision | n | mean | p50 | p90 | p99 | max (ms) |
|---|---|---|---|---|---|---|
| all | 7422 | 221 | 58 | 758 | 1889 | 2988 |
| bid | 942 | 46 | 60 | 66 | 78 | 118 |
| discard | 120 | 1109 | 982 | 2019 | 2951 | 2951 |
| trump | 120 | 1114 | 937 | 2081 | 2801 | 2988 |
| play, more than one legal card | 4962 | 268 | 84 | 776 | 1884 | 2113 |
| play, 21–28 cards left | 796 | 864 | 654 | 1849 | 1966 | 2113 |
| bank: discard | 400 | 1104 | 1021 | 1825 | 2763 | 3025 |
| bank: trump | 400 | 1088 | 902 | 1885 | 2635 | 2868 |
| bank: play, 21–28 live | 1348 | 785 | 610 | 1657 | 1748 | 1828 |

Every kind's p99 is at most 3.0 s against the 4.5 s target and the 4.8 s deadline.

## Settings

The `hard` defaults live in `packages/bots/src/hard/index.ts` (`HARD_DEFAULTS`). Individual options can be overridden in a spec, for example `hard:worlds=20,searchBid=0`.
