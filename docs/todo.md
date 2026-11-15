### TODO Updates
A scratchpad for future fixes, features, and updates

#### From the UI polish work (branch `worktree-ui-polish`)

- [ ] **Review and merge `worktree-ui-polish`.** It holds 8 commits: the app shell, the quieter log, status signals, hand order, animations, an engine phase fix, polish, and the e2e smoke test.
- [ ] **"Next hand" closes the result for everyone.** The engine's `continue` takes the first click (`packages/engine/src/reducer.ts`), so one player can dismiss the hand result before the others have read it. Possible fixes: every seated human confirms, and the dialog shows who is still reading; or a short minimum display time. This needs engine and server changes.
- [ ] **Finish the manual browser checks.** The e2e test does not cover these: run two windows (one private, joining by invite link) and check
  - the "● Your turn" tab title while the tab is in the background
  - the reconnect banner (stop the server, then restart it)
  - the "Invite link copied" toast, and the fallback dialog on plain http over a LAN IP
  - the layout at 900px, and with a 16-card hand while discarding
- [ ] **Tooltips on greyed-out cards.** These cards use `disabled`, and some browsers don't show a `title` tooltip on disabled buttons. Consider `aria-disabled` with click guarding, so the reason always shows.
- [ ] **Run `pnpm e2e` in CI.** It needs Chromium on the runner (for example `apt-get install chromium` and setting `CHROMIUM_PATH`), and takes about a minute.
- [ ] **Small screens.** The client is desktop-first; phones get a wrapped hand and a long page. Possible fixes: an overlapping fan of cards, and the score sheet and log in a drawer.

