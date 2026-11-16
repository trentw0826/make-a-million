# Make‑a‑Million – Architecture

This document describes how the application is organised. The rules themselves are in `game-rules.md`; what bots may know is in `bot-standards.md`; connection handling is in `multiplayer.md`.

## Packages

A pnpm monorepo, TypeScript throughout.

| Package | Name | Role |
|---|---|---|
| `packages/engine` | `@mam/engine` | Pure rules engine. No I/O, no timers, no network. |
| `packages/search` | `@mam/search` | Search machinery for the strong bots: a fast mutable play state, the open‑hand solver, the belief sampler, the match‑equity table. |
| `packages/bots` | `@mam/bots` | `BotStrategy` interface and the strategies behind each difficulty. |
| `packages/sim` | `@mam/sim` | Command‑line simulator: tournaments, invariant checks, replays. |
| `packages/protocol` | `@mam/protocol` | Message schemas shared by client and server (validated with zod). |
| `apps/server` | `@mam/server` | Node WebSocket server: rooms, sessions, bot runner, static hosting of the client. |
| `apps/client` | `@mam/client` | React + Vite browser client. |

Dependency direction is strictly downward: `client` → `protocol` → `engine`; `server` → `protocol`, `bots`, `engine`; `bots` → `search` → `engine`; `sim` → `bots`, `search`, `engine`. The engine depends on nothing.

## The engine

The engine is a **deterministic state machine**.

```
applyAction(state, seat, action)  →  { state', events[] }   or a RuleError
legalMoves(state, seat)           →  LegalMoves (a description of what seat may do now)
observe(state, seat)              →  Observation (everything that seat may know)
tableView(observation)            →  TableView  (what a human is shown)
```

- **All randomness is seeded.** The deal uses a PRNG stored in the state. The same ruleset, seed and action sequence always produce the same game.
- **Phases.** `misdeal-window → bidding → discarding → naming-trump → playing → hand-complete`, then either the next hand or `game-over`.
- **Legal moves are described, not listed.** Bids have no upper bound, so `legalMoves` returns a structured description (minimum bid, step, whether passing is allowed; which cards may be played; how many number cards a discard must include). `validate(state, seat, action)` is the single authority on legality and is used for humans and bots alike.
- **Ruleset.** House‑rule parameters (bid increment, minimum opening bid, misdeal threshold, target score, tie‑break) live in a `Ruleset` object passed to the engine. The deployed application uses one global default; tests and simulations may pass others.
- **Events.** Every transition emits `GameEvent`s (card played, trick won, hand scored, …). They drive the UI, the history inside observations, and logs.
- **Replay.** `GameRecord = { ruleset, seed, actions }`. Replaying a record rebuilds the identical final state. Records are used as regression fixtures.

## Two views of a game

Hidden information is enforced by projection, never by flags.

```
                 ┌────────────┐
   action ─────► │  GameState │  (full state: all hands, widow, deck – server memory only)
                 └─────┬──────┘
                       │ observe(state, seat)
                       ▼
                 ┌────────────┐   permitted information for one seat:
                 │Observation │   own hand, full public history, widow if bidder,
                 └─────┬──────┘   scores, legal moves           →  consumed by BOTS
                       │ tableView(observation)
                       ▼
                 ┌────────────┐   what the physical table shows:
                 │ TableView  │   own hand, current trick, auction, trump, trick
                 └────────────┘   counts, score sheet            →  sent to HUMANS
```

- A bot receives an `Observation` and nothing else. It cannot see other hands because the type never contains them.
- A human client receives a `TableView` over the wire. Past tricks and running totals are removed on the server, so inspecting network traffic reveals nothing beyond what the table would show.
- Both views are produced by pure functions in the engine and are covered by leak tests: changing hidden information (for example, permuting other players' hands) must not change the view.

## Flow of a turn

1. The server receives an `action` message from a human, or the bot runner produces one for a bot seat.
2. The server calls `validate`; an illegal action is rejected with an error (for humans) or logged and replaced by a legal fallback (for bots).
3. `applyAction` yields the new state and events.
4. For every seat the server computes `observe` and then `tableView`, and sends each connected human their `TableView` plus the events they're allowed to see.
5. If the seat to act next is a bot (or a human seat under bot control), the bot runner schedules a decision after a fixed, difficulty‑dependent delay.

## Bots

- One interface: `decide(observation, rng) → action`. Strategies are registered by difficulty id and can be swapped per seat.
- Current strategies: `easy` (random legal play, never raises), `normal` (heuristic evaluation, bidding, discarding and play) and `hard` (search: sampled deals solved with all hands open, plus simulation for contract decisions; see `bot-design.md`). Hard runs on server worker threads. An `expert` strategy (Hard with about three times the budget) exists in `@mam/bots` and the simulator but is not offered at the table yet; see `bot-roadmap.md`.
- The think delay is applied by the server, not the strategy, so timing carries no information.

## Server

- A single Node process holding all rooms in memory. One container; no database.
- Rooms are keyed by a six‑character code. Each room has four seats, a host, and at most one game at a time.
- Sessions are identified by a random token the browser keeps; it is how a player reclaims their seat after a reload or disconnect (see `multiplayer.md`).
- In production the same process serves the built client as static files.

## Client

- React + Vite, desktop‑first.
- Screens: Home (name, create/join), Lobby (seats, bots, start), Table, Hand Result, Game Over. A top bar on every screen carries the room code, a copyable invite link, How to play (the rules in brief, quoting the ruleset in play) and Leave, which asks first during a game because the seat goes to a bot at once.
- The look is defined by design tokens in `theme/tokens.css` (colours, type, card size, motion), with the timings mirrored for script in `theme/motion.ts`. Card faces and the card back come from the art manifest (`art/manifest.ts`); every entry is a placeholder for now (a shape and colour per suit, a medallion for each special card, a lattice back), and real art replaces them card by card. Each card still shows its index and name as text. The hand is shown by color, high to low; once trump is named the Tiger and the trump color come first (`handOrder.ts`; the engine's `sortHand` is unchanged).
- The client holds only the latest `TableView` and room state it received; all rules decisions are made on the server. What the table shows about the state of play (whose turn, each seat's call in the auction, the contract bar, the card winning the trick, why a card is greyed out) is derived from that view in `hints.ts`, so it never shows more than a player at the table would see.
- The trick on the felt is built from events, not from the view: the server sends each view just before the events that explain it, so after a trick's last card the view already holds the next, empty trick. A finished trick holds for a moment, then sweeps to its winner.
- The table fits the window without scrolling, except at phone width, where the seats stack and the page scrolls. Each side's total sits in the corner of the felt; the score sheet (one line per hand) and the table log wait in a drawer the player slides in from the other corner, which leaves the table playable while it is open.
- The table log keeps a few lines per hand (the deal, the auction as one line, trump, the result) and folds earlier hands away. Card plays and trick winners are never logged (see "Table Visibility" in `game-rules.md`).
- Card motion uses the Motion library: the deal flies from the dealer's seat, the fanned hand re-sorts, a card you play flies from your hand to the felt (it shares a layout id with its place there), the others' cards turn over as they land, and a taken trick is swept to its winner. The rest is CSS. Under `prefers-reduced-motion` cards appear in place and nothing moves.
- Sounds (the deal, a card played, a trick taken, your turn, the end of a hand) come from the sound manifest (`sound/manifest.ts`). Each is a placeholder synthesised with Web Audio until a recorded file is set. Audio starts on the player's first click or key, as browsers require, and the top bar's mute toggle is remembered in the browser.
- Keyboard: `?` opens How to play, Esc closes a dialog, ←/→ step a bid, Enter takes the main action.

## Testing

- **Engine:** one test file per section of `game-rules.md`, each bullet backed by a named test; property tests over thousands of random games (card conservation, money reconciliation, no illegal states); leak tests for both views; replay fixtures.
- **Bots:** every strategy plays many seeded games without a single illegal action; `normal` must beat `easy` by a clear margin; identical seeds produce identical games.
- **Server:** room logic unit tests with fake timers (grace period, takeover, room expiry, host transfer); an integration test over a real WebSocket where four bots play to game over and a scripted client disconnects and reconnects.
- **Client:** unit tests for the state reducer, the hand order and the status hints; component tests for the shell, cards, log and contract bar. `pnpm e2e` plays a hand against bots in headless Chromium and checks the signals, the hand order and the motion (including reduced motion); it needs a local Chromium, so it is not part of CI.
