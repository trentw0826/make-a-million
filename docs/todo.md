### TODO Updates
A scratchpad for future fixes, features, and updates

#### From the UI polish work

- [ ] **Finish the manual browser checks.** The e2e test does not cover these: run two windows (one private, joining by invite link) and check
  - the "● Your turn" tab title while the tab is in the background
  - the reconnect banner (stop the server, then restart it)
  - the "Invite link copied" toast, and the fallback dialog on plain http over a LAN IP
  - the layout at 900px, and with a 16-card hand while discarding
- [ ] **Small screens.** The client is desktop-first; phones get a wrapped hand and a long page. Possible fixes: an overlapping fan of cards, and the score sheet and log in a drawer.

