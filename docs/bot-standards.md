# Make‑a‑Million – Bot Standards

Bots can fill any seat a human player could. These standards set out what information a bot may use and how it must behave, so that a bot is a **fair stand‑in for a human player**. They apply to every bot strategy and every difficulty level, now and in the future.

## Core Principles

- **Information parity:** A bot may use only information that a human in the same seat could legitimately know. A bot never sees another player's cards, including its partner's.
- **Perfect memory is permitted:** A human could, in theory, memorize everything that has happened in a game. A bot may therefore keep and use the **full public history** of the game, plus anything its own seat has privately seen.
- **Less is allowed, more is not:** A strategy may choose to use less information than it is allowed (for example, a lower‑difficulty bot that ignores trick history). It may never use more.
- **Bots may remember more than the screen shows:** The human interface deliberately displays only what is visible at a physical table (see *Table Visibility* in `game-rules.md`): no played‑card history and no running totals. A bot may still keep that history, because a human could memorize it. This asymmetry is intentional, and it is bounded by what a human could in principle know.

## Permitted Information

A bot may use any of the following:

- **Own hand:** The cards it currently holds.
- **Table setup:** Seat positions, partnerships, the dealer, turn order, and which seats are bots.
- **Ruleset:** The rule configuration in effect for the game (for example, the bid increment).
- **Game history:** Cumulative scores and the full record of every earlier hand in the current game: bids, contracts, trump, and results.
- **Current hand, public events:** Misdeal calls, every bid and pass in order, the winning bid and bidder, and the named trump.
- **Current hand, play:** Every card played, who played it, which trick it was in and in what order, who won each trick, and where the Bull and Bear were played.
- **Widow (bidder only):** If the bot is the highest bidder, the three widow cards it picked up and the three cards it discarded.
- **Derived knowledge:** Anything that can be worked out from the above. For example:
  - which players are void in a suit, because they failed to follow it
  - which cards are still unseen
  - each team's captured Money so far

## Prohibited Information

A bot must never have access to:

- **Other players' hands**, including its partner's.
- **The widow or the discards** when it is not the bidder. A non‑bidder knows only that three unseen cards are out of play.
- **Deck order**, shuffle results, random seeds, or any other internal server state.
- **Future events**, such as which cards will be played or dealt.
- **Private channels:** Bots may not communicate with any other player, human or bot, by any means outside normal play. Two bots on the same team are completely independent and share no state or memory. (See *Table talk* in the game rules.)

## Enforcement

- **Observations only:** For each seat, the game engine produces an *observation* that contains exactly the permitted information above. The observation is the bot's **only** input. A bot never receives the full game state.
- **Same pipeline as humans:** Bot actions go through the same validation as human actions. The engine is the only authority on what is legal.
- **Illegal actions:** An illegal bot action counts as a defect. In live play, the server rejects the action, logs it, and plays a legal fallback so the game doesn't stall. In testing, any illegal action fails the test.

## Conduct

- **Play to win:** A bot always plays in its own team's interest. A lower difficulty means weaker play, never deliberately helping the opponents.
- **All decisions:** Bots must be able to make every decision a human makes: whether to call a misdeal, bid or pass, which cards to discard, which trump to name, and which card to play.
- **Pacing:** Bots wait briefly before acting, so humans can follow the play. The delay must **not** depend on the bot's hand or on the decision it made, so that timing gives away no information.

## Compute and Timing

- **Budgets, not clocks:** A search‑based bot limits its work by counts (search nodes, sampled deals), never by wall‑clock time, so the same observation and seed always give the same action.
- **Fixed reply time:** The server replies for a bot at a fixed, per‑difficulty delay that is longer than the bot's worst‑case thinking time. How long a bot "thinks" therefore reveals nothing about its hand or its choice. A deadline is kept only as a safety net, and monitoring checks that it essentially never fires:
  - The server passes each decision the time its reply is due, minus `botDeadlineMarginMs` (200 ms), as `DecideContext.deadline`. Simulations pass none, so their results stay deterministic.
  - Past the deadline, card play uses the deals solved so far (or one deal searched one trick deep, if none is finished), bidding and misdeal calls use the deals sampled so far (at least 16), and the discard and trump choice keeps the best candidate re‑checked so far.
  - The server logs `bot answered after its deadline` (at `warn`) whenever an answer arrives late. `packages/sim/scripts/timing.ts` reports each level's decision times (p50, p90, p99, max) to size the budgets against the delays.
- **Load:** When the server is busy it may give every bot a smaller budget. That depends on server load, never on any hand, so it leaks nothing.
- **No shared state:** Each decision is computed from the observation alone. Nothing persists between decisions, and nothing is shared between bots, including partners.

## Evaluation‑Only Oracles

- **Purpose:** To measure how much a bot loses by not seeing the cards, the simulator may run an *oracle*: a strategy that sees the full game state.
- **Never in play:** An oracle breaks every information rule above. It lives only in the simulator package, is never registered as a difficulty, and the server and the bot package cannot import it.

## Analysis

- **Purpose:** In a solo game the player may turn on an analysis of their own seat: their side's chance of winning and the value of each of their choices (with hints), and a grade for each move they make (with hints or feedback only) (see `game-rules.md`, Table Visibility). It lives in `@mam/bots` (`analysis/`) and reuses Hard's search.
- **Same limits as a bot:** Its only input is the player's own `Observation`, so it knows exactly what a bot in that seat would know, and nothing more. Its values come from sampled deals consistent with that observation, never from the real deal, so they cannot reveal another player's cards. A leak test checks this: hiding the other hands differently leaves the analysis unchanged.
- **Never plays:** No bot uses it, and it has no effect on what any bot does. It runs on its own random source, so turning it on never changes the bots' choices. On the server a bot decision goes ahead of any analysis still waiting for a worker thread. An analysis already running holds its worker until it finishes (well under its deadline), so with a single worker a Hard bot can occasionally start late; the server's `bot answered after its deadline` warning would show it.
- **Budgets and timing:** Like the bots, it is limited by counts (deals, search nodes). A deadline (`analysisMs`, 2 s) is only a safety net. It is shown only to the player it analyses, who already knows their own hand, so the time it takes reveals nothing.
- **Units:** Each choice is valued as the hand's expected score change for the player's side minus the opponents' (in dollars); the bar shows match equity. A move is graded by the money it gives up against the best choice: Best (under $1k), Good (under $5k), Inaccuracy (under $15k), Mistake (under $40k), otherwise Blunder; a lone legal move is Forced. Only the minimum bid is valued, so any bid is graded as bidding the minimum, and a misdeal is valued as an even fresh deal.

## Seat Substitution

- **Takeover:** When a bot takes over the seat of a disconnected human, it receives that seat's observation: the seat's hand, any widow knowledge the seat has, and the full public history. It receives nothing else.
- **Return:** When the human reconnects, they take back control at their next decision. The bot keeps nothing afterwards.

## Modularity and Difficulty

- **Common interface:** Every bot strategy uses the same interface. 
- **Interchangeable strategies:** Each seat's strategy can be chosen separately. A difficulty level is a choice of strategy and its settings, so a more advanced strategy (such as a search‑based or trained one) can replace a simpler one without changes elsewhere.
- **Labels:** A bot‑occupied seat is displayed as `Bot · <Difficulty>` (for example `Bot · Normal`), so humans always know who they are playing with and how strong that player is.
- **Determinism:** Bots use only the random source they are given. The same observation and the same seed must always produce the same action, so games can be tested and replayed exactly.

## Verification

- **Leak testing:** Tests must confirm that an observation stays the same when hidden information changes in any way that is consistent with it. For example, reshuffling the unseen cards among other players' hands must not change it.
- **Legality testing:** Every strategy must play large numbers of simulated games without a single illegal action.
- **Difficulty ordering:** In simulated bot‑versus‑bot games, each difficulty level must beat the level below it by a clear margin.
