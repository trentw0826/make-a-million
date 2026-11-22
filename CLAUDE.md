# Agent conventions

How to work in this repository. The README covers setup and commands; the docs in `docs/` are
the spec.

## Toolchain

- The system Node is too old. Prefix shell commands with `source ~/.nvm/nvm.sh && nvm use 24`.
  In a worktree, put the nvm Node `bin` directory on `PATH` instead.
- pnpm workspaces; Biome for lint and format; Vitest for tests.

## Before merging

- `pnpm check` must pass. It runs lint, typecheck, test and build, the same steps as CI.
- If the change touches the client or the client–server protocol, also run `pnpm e2e` (CI
  runs it as a separate job). Look at the screenshots in `apps/client/e2e/out/`, because passing checks do not
  prove the layout is right.
- Tests that use timers (server tests run on fake timers) must pass several runs in a row
  before they count as done.

## Branches and commits

- Never commit directly to `main`. Use one branch per task, and merge it with
  `git merge --no-ff` and the message "Merge the … branch".
- Write the commit subject as a plain sentence in the imperative ("Let every seat read the hand
  result"), with no `feat:`-style prefix. The body says why.
- Put an unrelated fix you notice along the way in its own commit, and name it in your report,
  so it can be cherry-picked.

## Architecture rules

- **Rules live only in `packages/engine`.** The engine is pure: no timers, I/O or randomness
  outside its seeded RNG. The server (`apps/server`) decides who may act and when, and owns
  every clock. The client only renders and sends actions.
- **Table visibility.** A human is only ever sent `tableView(observe(...))`; never send state
  that reveals hidden cards. Bots see only their own seat's `Observation`. See
  `docs/bot-standards.md` and "Table Visibility" in `docs/game-rules.md`.
- **Protocol changes go in together.** A change to the messages between client and server
  updates `packages/protocol`, the server, the client and `docs/multiplayer.md` in the same
  commit.

## Styling

- Never write a raw colour, font size, weight, line height, spacing, radius, z-index, opacity,
  duration, easing or spring in the client. Use a token from `theme/tokens.css` or a preset
  from `theme/motion.ts`; if none fits, add one there first (on its scale, if it has one).
  `pnpm lint` (Stylelint) and `designTokens.test.ts` enforce this.
- Build from the shared components in `apps/client/src/components/ui`: `Button` for every
  ordinary button (a plain `<button>` is only for game pieces such as cards), `Panel` for a
  surface, `Text` for a size or tone. Their styles are CSS Modules in the `ui` cascade layer;
  `styles.css` is unlayered, so a class passed in through `className` can adjust layout.

## Docs are the spec

- A rule change updates `docs/game-rules.md` first, then the code.
- A new timer or room behaviour updates `docs/multiplayer.md`.
- Remove an item from `docs/todo.md` in the commit that completes it.

## Tests

- Test each change at every layer it touches: engine (`packages/engine/test`), server
  (`apps/server/test`, with fake timers) and client (`apps/client/test`, Testing Library).
- Engine changes keep the invariant checks and the random full-game tests passing; extend
  them rather than weaken them.

## Worktree agents

- Work in `.claude/worktrees/<name>`; git and Biome ignore that folder. Don't merge your own
  branch into `main`.
- Finish with a report: what changed, the result of each check, and the hash of any
  unrelated commit.
