# Make‑a‑Million

A web‑playable version of the 1934 partnership trick‑taking card game, with live four‑seat
multiplayer, bots to fill empty seats, and a rules engine proven by tests.

- Rules: [docs/game-rules.md](docs/game-rules.md)
- What bots may know: [docs/bot-standards.md](docs/bot-standards.md)
- How it is built: [docs/architecture.md](docs/architecture.md)
- Rooms, seats and reconnection: [docs/multiplayer.md](docs/multiplayer.md)

## Requirements

Node 24 (`.nvmrc`) and pnpm 12 (`corepack enable`).

## Development

```sh
pnpm install
pnpm dev          # server on :3000 (tsx watch) + Vite client on :5173 with /ws proxied
```

Open <http://localhost:5173>, enter a name, create a room, add three bots and start.
Open a second browser (or a private window) and join with the room code to play with a friend.

## Checks

```sh
pnpm check        # lint + typecheck + test
pnpm test         # vitest across every package
pnpm lint:fix     # Biome
```

## Simulations

```sh
pnpm sim tournament --a normal --b easy --games 500   # win rates and margins
pnpm sim invariants --games 1000                      # engine invariants over bot games
pnpm sim bench                                        # engine/bot throughput
pnpm sim replay game.json                             # narrate a saved GameRecord
```

## Deploy

One container holds everything; state lives in memory (see docs/multiplayer.md).

```sh
docker build -t make-a-million .
docker run -p 3000:3000 make-a-million
```

Environment: `PORT` (3000), `GRACE_MS` (60000), `ROOM_IDLE_MS` (600000), `STATIC_DIR`.
Any host that supports long‑lived WebSocket connections will do.

## Layout

```
packages/engine    pure rules engine (deterministic, no I/O)
packages/bots      BotStrategy interface + easy/normal strategies
packages/sim       CLI: tournaments, invariant sweeps, benchmarks, replays
packages/protocol  client/server message schemas (zod)
apps/server        Node + ws: rooms, sessions, bot runner, static hosting
apps/client        React + Vite
```

The global ruleset (bid increment, misdeal threshold, target score, tie‑break) lives in
`packages/engine/src/ruleset.ts` (`DEFAULT_RULESET`); the server reads it from
`apps/server/src/config.ts`.
