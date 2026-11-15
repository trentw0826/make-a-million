# Make‑a‑Million – Strong Bot Design

How the **Hard** and **Expert** bots work, and why. Rules are in `game-rules.md`, what bots may know is in `bot-standards.md`, and measured results are in `bot-ladder.md`.

## Can the game be solved?

**Not the whole game.** Make‑a‑Million is a 2‑vs‑2 team game with hidden cards, chance and an auction. From the first trick a player faces about 10²⁰ possible arrangements of the unseen cards. Partners also cannot communicate, which makes computing an equilibrium intractable even for small team games. No bot can be guaranteed optimal.

**What the bots do get exactly right:**

- **Open‑hand positions.** With every hand visible, the solver finds the best play for both teams exactly. In TypeScript this is practical with about 7 tricks or fewer left.
- **Endgames.** When the unseen cards can be arranged in only a few ways, the bot lists every arrangement instead of sampling, so its choice is exactly best against its belief.
- **Equivalent cards.** Cards in one hand that are interchangeable (adjacent among the cards still out, with the same money value) are searched once.

**How closeness to optimal is measured:**

- **Duplicate evaluation:** bots are compared on the same deals with the seats swapped, so luck cancels.
- **The Oracle:** a simulator‑only bot that sees every hand, which gives an upper bound.

## Objective: win the game

Bots maximise the **probability of winning the game**, not points.

- A **match‑equity table** (`packages/search/src/generated/meTable.ts`, built by `pnpm sim me-table` from 20,000 self‑play games) gives P(win) at the start of a hand from both teams' scores and who deals.
- A hand's outcome is valued as the equity after scoring it, and a hand that ends the game is worth 1 or 0.
- This captures the jump at the contract amount and the different risks near $1M.
- Points mode is kept as a fast alternative for card play.

## Components

| Piece | Where | What it does |
|---|---|---|
| Play state | `packages/search/src/play/state.ts` | Bitmask hands with play/undo. Proven to match the engine on thousands of random positions. |
| Open‑hand solver | `packages/search/src/play/solver.ts` | Alpha‑beta between the teams with a cache keyed by relative ranks, merging of equivalent cards, MTD(f) and node budgets. It values positions in points or any utility, exactly or a few tricks deep with a greedy playout at the leaves. |
| Belief | `packages/search/src/belief/sampler.ts` | Every arrangement of the unseen cards consistent with what the seat has seen (hand sizes, voids, Bull/Bear leads, discards). Exact uniform sampling, plus listing all arrangements when there are few. |
| PIMC card play | `packages/bots/src/hard/pimc.ts` | Sample arrangements, solve each with all hands open, average each card's value, play the best. |
| Contract decisions | `packages/bots/src/contract/` | Misdeal, bid, discard and trump by simulating sampled deals. Other players' bidding is modelled on the Normal bot's. |
| Inference | `packages/bots/src/inference/` | Weights sampled arrangements by how well they explain the auction and the bidder's choice of trump. |
| Oracle | `packages/sim/src/oracle.ts` | Evaluation only; sees all hands. |

## Performance notes

- **Exact solving.** The solver handles about 7 tricks left in tens of milliseconds. The cost grows about 5× per extra trick, so a full 13‑trick solve is out of reach. At about 11M nodes per second, a Rust port (perhaps 3–5× faster) would not change that, so the search core stays in TypeScript and early‑hand positions use a depth‑limited search.
- **Depth‑limited search.** At 7 tricks left, searching 3 tricks deep and estimating the rest with a greedy playout picks the exactly best move 70% of the time, with a mean regret of $3.8k.
- **Budgets** are counted in nodes, and playout plies count as nodes, so a budget tracks real time. Decisions are deterministic for a given seed.
- **Serving.** The server runs Hard and Expert on worker threads and replies at a fixed delay per level (Hard 1.5 s, Expert 5 s), so thinking time reveals nothing.

## Known weaknesses and next steps

- **PIMC's two flaws.** *Strategy fusion*: it may plan to choose differently in worlds the player cannot tell apart. *Non‑locality*: it assumes opponents can see the cards. Planned fixes: αμ search for the bot's own side, and recursive PIMC near the end of a hand.
- **The greedy playout leaf is crude.** A learned value network, trained on exact solver values and then extended to earlier positions by bootstrapping, would make depth‑limited search much stronger.
- **Contract decisions use greedy playouts** and a model of other players' bidding built on the Normal bot. A contract value model trained on solver "par" values and calibrated to real play should replace it.
- **Inference uses only the auction and trump choice.** Weighting by the cards played, using a learned policy model, is the next step.
