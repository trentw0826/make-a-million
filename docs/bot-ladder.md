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

## Settings

The `hard` defaults live in `packages/bots/src/hard/index.ts` (`HARD_DEFAULTS`). Individual options can be overridden in a spec, for example `hard:worlds=20,searchBid=0`.
