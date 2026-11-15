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

### Tuning experiments (A against the Hard defaults unless stated; SPRT δ = 1%)

| Date | Change in A | Boards | ΔME per board (95% CI) | Δpoints per hand | Mean decision time A / B | Verdict |
|---|---|---|---|---|---|---|
| 2026‑11‑15 | 3× node budget, 60 worlds | 600 | +0.50% [−0.89, 1.90] | +3.7k | 358 / 180 ms (max 9.7 s) | not worth 2× the time; rejected |
| 2026‑11‑15 | search 3 tricks deep (B: 3× budget, as above) | 600 | −0.10% [−1.59, 1.39] | −0.1k | 817 / 351 ms | rejected |
| 2026‑11‑15 | play for match equity, utility inside the search | 600 | −0.95% [−2.39, 0.50] | −11.1k | 211 / 183 ms | rejected: see note 1 |
| 2026‑11‑15 | weight worlds by the auction and trump choice (pool 6×) | 600 | −0.19% [−1.70, 1.31] | −1.8k | 189 / 178 ms | inconclusive; off |
| 2026‑11‑15 | greedy-playout tweak (leaf estimate) | 100 positions | no clear regret change | — | — | reverted |

Notes:
1. A utility that depends on money already won ties each solved position to that money, so the cache is far less effective: exact six‑trick solves cost about 3× as many nodes (`packages/search/bench/utility.ts`), and 23% of them overflowed the per‑world node cap and dropped to depth‑limited estimates. A made fewer contracts (446 vs 457 of 600). Hence `fastUtility` (now the default for `playUtility=margin|equity`): solve in points, then apply the utility to each root move's value, which is exact once no Bull or Bear can change the money still out.
2. More nodes and more depth buy almost nothing at Hard's budget: card play by PIMC is saturated, so the remaining gains must come from elsewhere (better leaf estimates early in the hand, inference, PIMC's strategy-fusion flaw, contract decisions).

## Settings

The `hard` defaults live in `packages/bots/src/hard/index.ts` (`HARD_DEFAULTS`). Individual options can be overridden in a spec, for example `hard:worlds=20,searchBid=0`.
