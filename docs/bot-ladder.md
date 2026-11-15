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
| 2026‑11‑15 | expert (≈3× Hard's budget, more worlds) | hard (both still raising partner) | 1200 | +1.12% [−0.20, 2.44] | **+8.4k [1.5, 15.2]** | SPRT continue (LLR 1.37). 777 / 209 ms mean, max 28 s. A: 1172 contracts, 77.5% made; B: 1228, 75.2% |

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

Notes:
1. A utility that depends on money already won ties each solved position to that money, so the cache is far less effective: exact six‑trick solves cost about 3× as many nodes (`packages/search/bench/utility.ts`), and 23% of them overflowed the per‑world node cap and dropped to depth‑limited estimates. A made fewer contracts (446 vs 457 of 600). Hence `fastUtility` (now the default for `playUtility=margin|equity`): solve in points, then apply the utility to each root move's value, which is exact once no Bull or Bear can change the money still out.
2. More nodes and more depth buy almost nothing at Hard's budget: card play by PIMC is saturated, so the remaining gains must come from elsewhere (better leaf estimates early in the hand, inference, PIMC's strategy-fusion flaw, contract decisions).
3. Equity play made fewer contracts (809 vs 829) and lost points without gaining equity, although equity is what the boards are scored in. The table is not to blame (monotone and symmetric: `packages/sim/scripts/me-monotone.ts`). The likely cause is PIMC itself: every world is solved with all hands open, so it is over-confident about making or setting the contract exactly, and a steep utility amplifies that over-confidence where points dampen it.

4. Selection bias: `raisePartner`, `bidMargin` and `auctionSigma` were run on the same 1200 boards and the best was picked, which inflates it. The replication on fresh boards found nothing. **Rule from now on: a change is promoted only after it wins on boards it was not selected on.**
5. `raisePartner=0` on the two fresh board sets (842 and 1200 boards), pooled by inverse variance: ΔME +0.36% [−0.37, 1.09], Δpoints **+5.7k [1.8, 9.5]** per hand. Promoted to the default (`raisePartner: false`) because the points gain is clear on unselected boards, the equity gain is positive, it costs nothing (it saves a search), and the calibration explains it (partner-raise auctions were made 66% of the time). Its equity gain alone is not yet significant.
6. Per-decision RNG (common random numbers, `packages/sim/src/runner.ts`) narrowed the CI for the same boards and change by about 12% (±1.13% at 873 boards against about ±1.29%).
7. The hybrids (`hybrid:last=N`) keep Hard's contracts and replace its card play in the last N tricks with the oracle's. The gain is spread over the whole hand, about 10k per trick: the last 4 tricks are worth 25k, tricks 7–9 another 41k, the first 6 tricks another 62k. It is an upper bound that mixes two things: what seeing the cards is worth, which no real player has, and PIMC's own errors (strategy fusion, assuming that every other player can see every hand). The `peek` diagnostic separates part of the first: Hard's own search with only the named cards placed where they really are.

## Calibration (`packages/sim/scripts/calibrate.ts`)

Hard in all four seats, 300 hands (286 contracts), 2026‑11‑15:

- The bidding's playout estimate is **not** optimistic: estimate − actual capture is −18.0k [−25.5, −10.4] with the heuristic's discards and trump, −5.5k [−12.1, 1.2] with the contract as chosen.
- 78% of contracts are made. Bids up to $205k are made 75–86% of the time; bids of $215k or more only **43%** (42 contracts).
- By auction: forced $175k openings that everyone passes, 83% made (102); contested without a partner raise, 84% (93); auctions in which a player **raised over their own partner, 66%** (91, mean bid $209k). Raising partner is the clearest leak, hence the `raisePartner`, `bidMargin` and `auctionSigma` experiments. 39 of the 42 contracts at $215k or more came from auctions with a partner raise.

The same 300 hands after `raisePartner` was turned off (285 contracts):

- 80.7% made (was 78.0%); mean bid $182.8k (was $190.2k). Contracts at $215k or more: 15 (was 42), made 67% (was 43%). No auction has a partner raise.
- The estimate is still pessimistic: −20.3k [−28.2, −12.4] with the heuristic's contract, −13.6k [−20.9, −6.4] as chosen. It is also a weak predictor of the capture, even on the true deal: actual ≈ 126k + 0.52 × estimate (r = 0.48, residual SD 61k). Low estimates come out much better than predicted: contracts estimated $20–40k short were made 58% of the time. Of the contracts the estimate said would fail, 53 were made and 32 set.

## Settings

The `hard` defaults live in `packages/bots/src/hard/index.ts` (`HARD_DEFAULTS`). Individual options can be overridden in a spec, for example `hard:worlds=20,searchBid=0`.
