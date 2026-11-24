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
| 2026‑11‑24 | **expert** (the final Expert: Expert‑0 with the bidding package, policy inference and auction inference; `0caa02d`), **fixed 1500 fresh boards** (`SPRT=0`, seed `xb14`) | hard | 1500 | **+3.68% [2.39, 4.97]** | **+24.5k [17.4, 31.6]** | A won 1413 of 3000 contracts and made 77.6%; B won 1587 and made 70.9%; mean bids $211k and $210k. Mean decision 780 / 157 ms on a busy machine (no deadline in the simulator) |
| 2026‑11‑24 | expert, **replication on fixed 1500 fresh boards** (seed `xb15`) | hard | 1500 | **+4.11% [2.86, 5.35]** | **+32.3k [25.2, 39.5]** | **Pooled with `xb14`** by inverse variance: ΔME **+3.90% [3.00, 4.80]**, Δpoints **+28.4k [23.3, 33.4]** per hand. Expert is clearly stronger than Hard. A won 1356 of 3000 contracts and made 76.5%; B won 1644 and made 68.4% |
| 2026‑11‑24 | expert (the final Expert, `0caa02d`), **fixed 1500 fresh boards** (`SPRT=0`, seed `xb21`) | expert0 | 1500 | **+1.36% [0.10, 2.62]** | **+13.6k [6.6, 20.6]** | The final Expert against the baseline it was built from. The three promoted steps sum to +2.7% equity (+1.26%, +0.84%, +0.63%, each pooled from two runs), just above this interval, and +16.3k points, inside it: steps promoted on noisy estimates are biased upward, and gains need not add. Measured through Hard instead (+3.90% pooled against Expert‑0's +1.35%), the difference is +2.55% [0.97, 4.13]; the two agree within their noise. A won 1386 of 3000 contracts and made 77.1%; B won 1614 and made 73.8%; mean bids $212k and $208k. Mean decision 697 / 576 ms on a busy machine (no deadline in the simulator) |

### The robustness gate for Expert (2026‑11‑24)

Before Expert is offered, it must be no worse than Hard where the table differs from self‑play: with a weaker partner, against a player who bids little, against a weaker table. All from the frozen final Expert (`0caa02d`), `SPRT=0`, 800 fresh boards each. With a partner, each team is the named bot and its partner (`A&P|B&Q`); the two rows with the same seed share their boards.

| Setting | Seed | A | B | ΔME per board (95% CI) | Δpoints per hand (95% CI) | Contracts (made) A / B |
|---|---|---|---|---|---|---|
| partnered with Normal | `xb16` | expert & normal | hard & normal | +0.78% [−0.80, 2.35] | **+9.2k [0.6, 17.8]** | 680 (79.7%) / 920 (77.6%) |
| partnered with Easy | `xb17` | expert & easy | hard & easy | +0.68% [−1.12, 2.48] | **+15.3k [4.8, 25.9]** | 610 (72.3%) / 990 (70.5%) |
| against a passive bidder (Hard uncalibrated) | `xb18` | expert | hard, `calibA=0,calibB=1,calibSd=0` | **+4.39% [2.56, 6.21]** | **+18.1k [8.4, 27.7]** | 1020 (78.8%) / 580 (75.2%) |
| … the same for Hard | `xb18` | hard | the same | **+2.42% [0.77, 4.06]** | +0.2k [−8.6, 8.9] | 1032 (74.1%) / 568 (72.7%) |
| against Normal | `xb19` | expert | normal | **+14.32% [12.53, 16.12]** | **+69.7k [60.7, 78.6]** | 958 (91.8%) / 642 (77.1%) |
| … the same for Hard | `xb19` | hard | normal | **+11.59% [9.78, 13.40]** | **+55.2k [45.6, 64.8]** | 1010 (88.8%) / 590 (77.6%) |

**Passed.** With a weak partner Expert still gains points over Hard in the same seat (its equity gain is smaller and not significant on 800 boards: the partner's mistakes dominate). Against the passive bidder and against Normal it beats each by more than Hard does, by about 2.0% and 2.7% equity on the same boards.

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

### Expert experiments (A against Expert‑0 unless stated; SPRT δ = 1%, at least 200 boards)

Each option is screened by SPRT, then confirmed on a fixed 1500 fresh boards before it is promoted (an SPRT estimate is biased toward its verdict, note 9). Seeds are listed in `bot-roadmap.md`.

| Date | Change in A | Seed | Boards | ΔME per board (95% CI) | Δpoints per hand (95% CI) | Mean decision time A / B | Verdict |
|---|---|---|---|---|---|---|---|
| 2026‑11‑23 | `contractValue=model` (bid on the contract‑value model's estimate, not the calibrated playout) | `xb4` | 845 | **+2.03% [0.63, 3.44]** | **+12.5k [4.7, 20.4]** | 618 / 606 ms (busy machine) | **H1**. A won 848 of 1690 contracts and made 77.9%, mean bid $213k; B won 842, made 75.2%, $208k. Confirming on fixed fresh boards (`xb7`) |
| 2026‑11‑23 | `contractValue=model`, **fixed 1500 fresh boards** (`SPRT=0`) | `xb7` | 1500 | +0.38% [−0.73, 1.49] | +1.9k [−4.2, 8.1] | 618 / 618 ms (busy machine) | **not confirmed**: the screen's estimate was mostly its stopping bias (note 9). A won 1491 of 3000 contracts and made 75.9%, mean bid $213k; B won 1509, made 76.8%, $208k. A second fixed run (`xb9`) is queued, to pool with this one |
| 2026‑11‑23 | `contractValue=model`, **second fixed 1500 fresh boards** | `xb9` | 1500 | +0.77% [−0.30, 1.84] | +4.3k [−1.7, 10.3] | 621 / 611 ms (busy machine) | not significant alone. **Pooled with `xb7`** by inverse variance: ΔME **+0.58% [−0.19, 1.35]**, Δpoints **+3.1k [−1.2, 7.4]**. Probably a small real gain; tested together with `ceilingModel=fitted` (`xb10`). A won 1496 of 3000 contracts and made 74.8%; B won 1504, made 74.3% |
| 2026‑11‑23 | `ceilingModel=fitted` on top of `contractValue=model` (B: `contractValue=model`) | `xb5` | 1500 | +0.62% [−0.42, 1.65] | +1.3k [−4.4, 7.0] | 628 / 613 ms (busy machine) | SPRT continue at its 1500‑board cap (LLR 0.42), so unbiased by a stop: inconclusive. A won 1558 of 3000 contracts and made 77.3%, mean bid $206k; B won 1442, made 77.5%, $209k |
| 2026‑11‑23 | `bidOutcome=auction` on top of `contractValue=model` (B: `contractValue=model`) | `xb8` | 1500 | +0.23% [−0.76, 1.21] | −2.4k [−7.9, 3.1] | 636 / 592 ms (busy machine) | SPRT continue at its cap (LLR −1.09): **rejected**, no gain worth having. A bid far more and won 1829 of 3000 contracts, made 74.7%, mean bid $211k; B won 1171, made 75.9%, $213k. Pushing the opponents up gains nothing without knowing, as the hindsight oracle did, that they will fail |
| 2026‑11‑23 | **the bidding package**: `contractValue=model,ceilingModel=fitted`, **fixed 1500 fresh boards** (`SPRT=0`) | `xb10` | 1500 | **+1.51% [0.30, 2.71]** | **+9.4k [2.9, 15.9]** | 652 / 645 ms (busy machine) | significant. A won 1403 of 3000 contracts and made 75.3%, mean bid $211k; B won 1597, made 72.9%, $208k: fewer contracts, more of them made |
| 2026‑11‑23 | the bidding package, **replication on fixed 1500 fresh boards** | `xb11` | 1500 | +1.03% [−0.14, 2.19] | **+7.6k [1.0, 14.3]** | 597 / 594 ms (busy machine) | **Pooled with `xb10`** by inverse variance: ΔME **+1.26% [0.42, 2.10]**, Δpoints **+8.5k [3.9, 13.2]**. **Promoted** to `EXPERT_DEFAULTS` (2026‑11‑23). A won 1414 of 3000 contracts and made 73.8%, mean bid $212k; B won 1586, made 72.6%, $208k |
| 2026‑11‑23 | `policyInference=1` on top of the bidding package (B: the bidding package), **fixed 1500 fresh boards** | `xb3` | 1500 | **+1.21% [0.37, 2.04]** | +4.3k [−0.3, 8.8] | 652 / 594 ms (busy machine) | significant in equity. Card play only, so both sides hold the same 3000 contracts: A made 1181 of A's 1500 as declarer, B 1166 of B's 1500 |
| 2026‑11‑24 | `policyInference=1` on top of the bidding package, **replication on fixed 1500 fresh boards** (A: `expert:policyInference=1`, B: `expert`) | `xb13` | 1500 | +0.45% [−0.41, 1.30] | +3.4k [−1.3, 8.2] | 633 / 580 ms (busy machine) | **Pooled with `xb3`**: ΔME **+0.84% [0.24, 1.43]**, Δpoints **+3.9k [0.6, 7.1]**. **Promoted** to `EXPERT_DEFAULTS` (2026‑11‑24). A made 1141 of its 1500 contracts, B 1124 |
| 2026‑11‑24 | `auctionInference=1` with the fitted bidding model, on top of policy inference (A: `expert:policyInference=1,auctionInference=1`, B: `expert:policyInference=1`) | `xb12` | 1500 | +0.61% [−0.29, 1.51] | +4.4k [−0.5, 9.3] | 691 / 630 ms (busy machine) | SPRT **continue** at the 1500‑board cap (LLR 0.54), so effectively a fixed run. Card play only: A made 1154 of its 1500 contracts, B 1131. A gain this size is worth having; replicating on fixed fresh boards (`xb20`) |
| 2026‑11‑24 | `auctionInference=1` with the fitted bidding model, **replication on fixed 1500 fresh boards** (the same A and B) | `xb20` | 1500 | +0.64% [−0.26, 1.55] | +3.3k [−1.4, 8.1] | 696 / 636 ms (busy machine) | **Pooled with `xb12`**: ΔME **+0.63% [−0.01, 1.27]**, Δpoints **+3.9k [0.5, 7.3]**. Both point estimates positive, a clear points gain, about 10% more decision time: **promoted** to `EXPERT_DEFAULTS` (2026‑11‑24) on the standard of note 10. A made 1155 of its 1500 contracts, B 1141 |

## Headroom (Phase 2 of the Expert work)

**Where Expert‑0's card play loses** (`scripts/regret.ts expert0 300`, seed `xb-regret1`, 2026‑11‑23). Expert‑0 in all four seats, 300 hands, 12,416 card plays with a choice. Each chosen card is scored against the best card in the true deal, solved with all hands open: exactly with 7 or fewer tricks left, otherwise 3 tricks deep plus the greedy playout. Regret is in $1000s of margin between the teams; it mixes what no player can know with what a better bot could avoid.

| Decisions | n | Mean regret ($k, ±95%) | Wrong card | Per team‑hand ($k) |
|---|---|---|---|---|
| all | 12416 | 8.65 ± 0.43 | 26.2% | 179.0 |
| declaring | 6298 | 7.66 ± 0.51 | 26.2% | 80.4 |
| defending | 6118 | 9.66 ± 0.70 | 26.2% | 98.5 |
| lead | 3551 | 19.38 ± 1.28 | 43.5% | 114.7 |
| follow, 2nd / 3rd / 4th | 2899 / 3024 / 2942 | 5.01 / 5.00 / 3.03 | 22% / 22% / 14% | 24.2 / 25.2 / 14.9 |
| declaring, lead | 2001 | 14.10 ± 1.29 | 38.8% | 47.0 |
| defending, lead | 1550 | 26.20 ± 2.36 | 49.7% | 67.7 |
| declaring, follow | 4297 | 4.66 ± 0.41 | 20.3% | 33.4 |
| defending, follow | 4568 | 4.05 ± 0.36 | 18.3% | 30.9 |

By trick, per team‑hand: 32.9k (trick 1), 28.8k, 23.8k, 21.2k, 16.7k, 14.7k (trick 6), then 9.1k, 9.1k, 8.4k, 6.8k, 4.4k, 3.0k once solving is exact (tricks 7–12). **Leads carry two thirds of the regret, defenders' leads the most** (wrong half the time, 26k a decision). The early tricks dominate. That is where hidden cards matter most and where search is depth‑limited, so this table alone cannot say how much is avoidable; the oracle, rollout and peek runs below split it.

**Bounds on the contract decisions** (hindsight oracles, `hindsight:kinds=…,base=expert0` against Expert‑0, `SPRT=0`, 200 boards, seed `xb2`). At each decision of the chosen kind the oracle applies every candidate to the true deal and plays the rest of the hand out with the table's own bots and the simulator's own random streams, so it knows each candidate's result exactly, and plays the best. Its margin over Expert‑0 bounds what better decisions of that kind could gain. The bound is loose: the oracle also knows how the rest of the hand will be played.

| Decision | Candidates | ΔME (95% CI) | Δ points ($, 95% CI) | Contracts made (oracle / Expert‑0) |
|---|---|---|---|---|
| bid and misdeal | the bot's own, pass, the minimum bid, misdeal | +27.9% [24.7, 31.1] | +163k [148k, 178k] | 203 of 213 (95%) / 76 of 187 (41%) |
| trump | every suit, after the bot's own discard | +6.0% [3.9, 8.1] | +31.3k [21.1k, 41.4k] | 170 of 200 (85%) / 154 of 200 (77%), the same contracts |
| discard | the bot's own and the 6 best by a greedy open‑hand playout of the true deal; the bot then names trump | +5.7% [3.8, 7.6] | +30.7k [21.0k, 40.4k] | 169 of 200 (85%) / 154 of 200 (77%), the same contracts |

On bidding, most of the margin is knowledge no bot can have. The oracle declares only contracts it will make, and it pushes the opponents into contracts it knows they will fail: Expert‑0 made 41% of its contracts here, against 73% in ordinary play (Expert‑0 against Hard, `xb1`). The bound is of the same order as the all‑seeing card‑play oracle's against Hard (+21.9%, Results), and the bidding ideas are cheap to test, so bidding stays first in the plan. The discard and the trump choice, made once a hand by the declarer, are each worth about 6% in hindsight on the same contracts.

**Bounds on card play** (against Expert‑0, `SPRT=0`, the same 200 boards, seed `xb2`, 2026‑11‑24). Every A keeps Expert‑0's contract decisions; the contracts are the same 200, so the contracts made show the card play.

| A plays cards with | ΔME (95% CI) | Δ points ($, 95% CI) | Contracts made (A / Expert‑0) |
|---|---|---|---|
| every hand open, every trick (`hybrid:last=13`: exact from 7 tricks out, otherwise 3 tricks deep) | +19.2% [16.1, 22.3] | +131k [115k, 148k] | 181 / 112 |
| every hand open, the last 4 tricks (`hybrid:last=4`) | +4.5% [2.9, 6.1] | +30.0k [20.6k, 39.3k] | 163 / 145 |
| Expert‑0's information, the last 4 tricks valued by playing the hand out with Expert‑0 in all seats, 16 worlds (`rollout:last=4`) | +0.5% [−0.9, 1.9] | +2.7k [−5.6k, 11.0k] | 155 / 152 |
| Expert‑0's own search on the true deal (`peek:cards=all`) | +15.9% [13.0, 18.8] | +110k [94k, 126k] | 179 / 118 |
| … with only partner's hand where it really is (`peek:cards=partner`) | +9.8% [7.1, 12.6] | +69.6k [54.1k, 85.1k] | 164 / 129 |
| … the left‑hand opponent's hand (`lho`) | +9.2% [6.6, 11.8] | +66.5k [50.6k, 82.4k] | 170 / 131 |
| … the money cards (`money`) | +8.8% [6.1, 11.5] | +55.2k [40.0k, 70.5k] | 167 / 138 |
| … the trumps, the Tiger included (`trumps`) | +7.2% [4.3, 10.2] | +46.6k [31.7k, 61.6k] | 163 / 136 |
| … the Tiger, Bull and Bear (`bull+bear+tiger`) | +1.3% [−1.2, 3.8] | +9.0k [−5.5k, 23.5k] | 159 / 154 |

What this says:

- **The gap is information, not search.** In the last 4 tricks, where Expert‑0 already solves every world exactly, an all‑seeing player gains 30k a hand, but valuing each card by a realistic playout instead of the open‑hand solve (no strategy fusion, no assumption that the others see every hand) gains only 2.7k [−5.6, 11.0]. So PIMC's own flaws cost little there. They cannot be measured this way earlier in the hand, but bridge found the same (fusion fixes changed about 1% of deals; `bot-research.md`).
- **With the cards open, a deeper search does help**: the oracle (3 tricks deep) beats Expert‑0's own 2‑deep search on the true deal by about 21k. In real play it does not (Tuning experiments: 3 tricks deep, −0.1% [−1.6, 1.4] for Hard; for Expert it cost 2.3× the time), because the sampling of hidden cards swamps it. A learned leaf evaluation would be one more way to search deeper, so it is unlikely to pay either.
- **What to infer:** knowing one other hand is worth two thirds of the whole (partner 70k, the left‑hand opponent 67k, out of 110k). Of single card groups, where the money and the trumps lie is worth 55k and 47k. Where the Tiger, Bull and Bear lie is now worth only 9k: specials inference already gets most of the 21k it was worth against Hard (note 10).

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

**Card play's auction evidence by the fitted bidding model** (`auctionInference` with `ceilingModel: 'fitted'`). Hard weighs worlds by the auction only with the heuristic ceilings, which was rejected (no gain in play). On 3,765 banked plays (`timing-xb1`, every fourth, the same 360‑world pools; `inference-eval.ts`):

| Weighting | all | money | specials | tricks 2–5 | 6–9 | 10–13 | ESS |
|---|---|---|---|---|---|---|---|
| uniform | −1.134 | −1.012 | −1.094 | −1.187 | −1.116 | −0.942 | 360 |
| specials (Hard today) | −1.132 | −1.012 | −1.069 | −1.186 | −1.114 | −0.938 | 342 |
| auction, heuristic ceilings | −1.190 | −1.076 | −1.208 | −1.249 | −1.169 | −0.978 | 117 |
| auction, fitted model | −1.126 | −1.004 | −1.091 | −1.180 | −1.106 | −0.934 | 318 |
| specials + auction, fitted | −1.124 | −1.005 | −1.066 | −1.179 | −1.104 | −0.930 | 302 |
| policy | −1.109 | −0.988 | −1.075 | −1.174 | −1.083 | −0.883 | 216 |

The heuristic ceilings put the truth *less* likely than no weighting at all, which explains their rejection. The fitted model moves it the right way, about five times as far as the specials model and a third as far as the policy model, at little cost in sample size. Worth a duplicate test on top of the current Expert: it gained +0.63% [−0.01, 1.27] over two fixed runs and was promoted (Expert experiments, `xb12`, `xb20`).

**Tempering Expert's combined weights** (specials × policy × fitted auction, as Expert multiplies them; `SCHEMES=expert`, the same 3,765 plays and pools, 2026‑11‑24). Each setting changed alone from Expert's (policy temperature 1.5 and mix 0.8, auction temperature 1.5, pool 360):

| Setting | all | money | specials | tricks 2–5 | 6–9 | 10–13 | ESS |
|---|---|---|---|---|---|---|---|
| Expert as it is | −1.0999 | −0.9798 | −1.0593 | −1.1664 | −1.0713 | −0.8741 | 185 |
| policy temperature 1.0 / 1.25 / 2.0 | −1.1003 / −1.0989 / −1.1033 | | | | | | 121 / 157 / 223 |
| policy mix 0.6 / 0.9 / 1.0 | −1.1033 / −1.0987 / −1.0978 | | | | | | 208 / 172 / 159 |
| auction temperature 1.0 / 2.0 | −1.0987 / −1.1014 | | | | | | 166 / 193 |
| pool 720 (inferencePool 12) | −1.0964 | −0.9768 | −1.0571 | −1.1628 | −1.0680 | −0.8710 | 367 |

Expert's settings are near the best. The best of each (a pool of 720, mix 1.0, auction temperature 1.0) would together gain about 0.006 nats a card, a quarter of what policy inference gained (0.025, worth +0.8% equity), so about 0.2% equity; mix 1.0 would also drop the guard against play the model does not expect, such as a human's. **Rejected** offline: under the stopping rule's 0.5%.

**Contract‑value model** (`contractValue: 'model'`, `contract/value.ts`). A linear model of the declaring team's capture from 23 features of the deal: the playout estimate, money, trump lengths, specials, top trumps, side aces, voids. Data: Hard self‑play, 4000 hands with the auction scripted so that a random seat declares (seed `xb-cvm1`, so weak hands are covered) and 2000 natural hands (`xb-cvm2`). Trained on the forced contracts and tested on the natural ones:

| Estimate of the capture | r | RMSE | make/set log loss |
|---|---|---|---|
| calibrated playout (130k + 0.5 × estimate; today) | 0.552 | 56.0k | 0.490 |
| playout refitted | 0.552 | 55.7k | 0.488 |
| model | **0.721** | **46.3k** | **0.414** |

On a held‑out fifth of the forced contracts it gives r 0.716 against 0.562. The generated model is fitted on all 6000 (residual SD 45.9k). On 3101 banked bid turns it bids 54.9% of the time against Expert‑0's 61.8% (87% of decisions unchanged), and it calls a misdeal on all 22 eligible hands where Expert‑0 calls 9: weak hands look weaker without the calibration's lift.

**Auction model** (`ceilingModel: 'fitted'`, `contract/auction.ts`). A logistic model of P(bid | the seat's 13 cards, price) on 11,462 turns of the natural auctions (forced openings and turns with partner high left out). Held‑out log loss **0.567**, against 0.647 for a constant bid rate and **2.31** for the heuristic ceilings that Hard uses today. The bots bid 65% of the time, nearly regardless of the hand: the ceiling is about $205k for a typical hand and moves mostly with the longest suit, with a scale σ of 65k (the heuristic model assumed 20k). On the banked bid turns: bids 58.5% (86% unchanged); with the contract‑value model too, 48.6% (80% unchanged).

**Discard and trump screened by the contract‑value model** (`screenValue: 'model'`). The hindsight discard and trump oracles gain about 6% each (Headroom), and the screen picks which candidates the search re‑checks. On the 400 banked discards and 400 trump choices with true hands (`timing-xb1`), the model changes 147 discards (36.8%) and 4 trump choices, at about the same time. Each discard is scored by its best trump's open‑hand value on the true deal (`scripts/discard-dd.ts`, 3 tricks deep plus the greedy playout): the model's discards are worth **+0.7k [−2.4, 3.8]** per discard more, +1.9k [−6.4, 10.3] where they differ. Against a bound of about 30k a board that is nothing measurable. **Rejected** offline. A bigger re‑check (`refineWorlds` 40 instead of 24, 1.5× the time) changes 83 discards (20.8%) and is worth +0.15k [−1.65, 1.95] per discard: **rejected**. The discard is not short of search; the candidates it chooses among are close in value, which is why both changes move so many discards and gain nothing.

**More worlds for leads** (`leadWorlds`). Leads carry two thirds of the regret (Headroom, above), so their per‑card averages might be too noisy. On 1200 banked leads before the exact window (29–52 live cards), 180 worlds instead of 60 gave a true‑deal regret 0.77k [−1.25, 2.79] per lead *higher* than Expert‑0's (36.7k against 35.9k; 72% of cards unchanged), at 2.4× the time. **Rejected:** lead regret is not sampling noise.

**Bids valued by the rest of the auction** (`bidOutcome: 'auction'`). Bidding valued the minimum bid as if it won the contract at that price. With this option an opponent whose modelled ceiling reaches the next price overcalls instead, so the bid can push them to a dearer contract; the hindsight oracle won much of its margin that way (Headroom). On every third of the 3101 banked bid turns (1034, `timing-xb1`), both with the contract‑value model, it changes 10.0% of decisions: 93 passes become bids and 10 bids become passes. Bids take no longer (p99 236 ms against 229 ms). Screened by SPRT against the contract‑value model (`xb8`).

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

**Expert with the bidding package** (`contractValue: 'model'`, `ceilingModel: 'fitted'`), with policy inference on top, and with auction inference on top of that (the current Expert), 2026‑11‑23/24. Same hands (`timing-xb2`) and bank (`timing-xb1`), 4 workers, idle machine apart from the desktop:

| Decision | Expert‑0 p99 / max | + bidding package | + `policyInference` | + `auctionInference` p99 / max (ms) |
|---|---|---|---|---|
| all | 1889 / 2988 | 1666 / 2607 | 1712 / 2665 | 1760 / 2682 |
| bid | 78 / 118 | 94 / 107 | 96 / 102 | 94 / 114 |
| discard | 2951 / 2951 | 2601 / 2607 | 2626 / 2665 | 2620 / 2682 |
| trump | 2801 / 2988 | 2594 / 2605 | 2563 / 2633 | 2562 / 2603 |
| play, 21–28 cards left | 1966 / 2113 | 1702 / 1728 | 1755 / 1833 | 1814 / 1867 |
| play, 5–12 cards left | — | 7 / 11 | 65 / 70 | 101 / 111 |
| bank: bid (3101) | 62 / 110 | 95 / 133 | — | — |
| bank: misdeal (22) | 114 / 114 | 81 / 81 | — | — |
| bank: discard (400) | 2763 / 3025 | 2523 / 2854 | — | — |
| bank: trump (400) | 2635 / 2868 | 2402 / 2675 | — | — |

The models make a bid about 15 ms slower; everything else is run‑to‑run variation. Policy inference adds about 10% to the mean (226 against 204 ms), most of it late in the hand where decisions are fast. Auction inference adds about 9% more (246 ms mean), again mostly late in the hand. Card play's inference does not touch the contract decisions, so their bank timings stand. Every kind's p99 stays under 2.7 s against the 4.5 s target.

## Settings

The `hard` defaults live in `packages/bots/src/hard/index.ts` (`HARD_DEFAULTS`). Individual options can be overridden in a spec, for example `hard:worlds=20,searchBid=0`.
