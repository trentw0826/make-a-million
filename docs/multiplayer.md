# Make‑a‑Million – Multiplayer Rules

How rooms, seats and connections behave. The aim is a small, predictable set of rules that keep a game going when someone's connection drops, without accounts or a database.

## Identity

- **Guests only.** A player chooses a display name; there are no accounts.
- **Session token.** On first contact the server issues a random token, which the browser stores locally. The token is what ties a browser to a seat. Clearing it, or using another browser, counts as a new player.

## Rooms

- **Private codes.** A room is created by a host and identified by a six‑character code. Anyone with the code can join; there is no public listing.
- **Four seats.** Seats are arranged around the table; opposite seats are partners. Every seat starts with a Normal bot. Players **pick their own seats**, and so their own partners, by clicking any seat a bot holds; the bot makes way. A player may stand up and move while the room is in the lobby, and the seat they leave gets a Normal bot again.
- **Bots.** The host may set the difficulty (Easy, Normal or Hard) of the bot in any seat. A game can start with any mix, including one human and three bots. Each level replies after a fixed delay (700, 900 and 1500 ms), whatever it decides.
- **Starting.** The host starts the game once at least one human is seated. Seats are locked for the whole game.
- **No spectators and no mid‑game joining.** During a game the only way into a room is to reclaim your own seat with your token.
- **Play again.** After a game ends, the host may start another with the same seats. Scores reset.

## Solo rooms

- **Reached from Home.** "Play solo" makes a private room for one player and three bots. You sit at Seat 1, and Seat 3 is your partner. In the lobby you choose each bot's level on its chair, may turn the analysis on (see `game-rules.md`, Table Visibility), and start. Nobody else is involved, so there is no host tag and the room code is not shown.
- **Nobody else can enter.** Its code leads nowhere for anyone else (`ROOM_NOT_FOUND`). Its player reclaims it with their token like any seat.
- **No clocks on the player.** The hand result stays up until you press Ready (the bots confirm at once), with no countdown. If you disconnect, the game waits for you: there is no grace period and no bot takeover. Only the room's idle close ends it, 10 minutes after you were last connected.
- **Undo and redo.** `undo` takes back your last decision (a confirmed hand result is not one) and everything that followed it, back to the moment the decision was yours. You can step back as far as the start of the game, across hands. `redo` replays the decision last taken back and what followed it, up to your next decision, so the bots play exactly the line you undid. A new decision of yours forgets the line taken back. The server keeps the game as a record (seed, dealer and every action) and rebuilds the position with the engine's `replay`, so the deal is exactly as it was. A bot answer still on its way is dropped. After a jump the server sends `rewound` (saying `undo` or `redo`), then the view; no events explain the jump, so the client clears the felt and rewrites the hand's log lines from the view. `RoomView.canUndo` and `canRedo` say whether there is anything to undo or redo. Elsewhere both are refused (`NOT_SOLO`), and with nothing to undo or redo, `NOTHING_TO_UNDO`.
- **Leaving ends the game**, since you are its only human.
- **Analysis** can be turned on or off at any time with `setAnalysis`, in the lobby or from the table's corner. A table that is not solo refuses it (`NOT_SOLO`). While it is on:
  - after every view, the server sends an `analysis` message: your side's chance of winning, and on your turn the value of each choice. The server sends it only while that position is still the one on the table, so it always follows the view it belongs to, and a later view makes it stale. Each position is analysed once (a re-sent view reuses it), from a seed fixed by the game and the position, so a position met again after an undo is valued exactly as before.
  - after each decision of yours, it sends a `moveReview` grading it against the best choice, even if the game has moved on by then. If you choose faster than the analysis, the review comes when the analysis is done. No review is sent for a move taken back first.
  - the analysis runs on the bot worker threads, and a bot decision goes ahead of any analysis waiting there (see *Analysis* in `bot-standards.md`).

## Host

- The player who created the room is the host.
- If the host disconnects for longer than the grace period or leaves, the host role passes to the longest‑connected remaining human. If no human is connected, the room waits (see *Room lifetime*).
- Only the host may set a bot's difficulty, start a game or start a new one.

## Disconnection and reconnection

- **Reconnect any time.** A player who reloads the page or reconnects presents their token and is returned to their seat with the current table view. Nothing is lost.
- **Grace period: 60 seconds.** When a human disconnects during a game, their seat waits. If it is their turn, the game waits with them. Other players see the seat marked as disconnected.
- **Bot takeover.** If the player is still absent when the grace period ends, a bot takes control of the seat and plays on, using exactly that seat's information and nothing more (see `bot-standards.md`). The seat is marked as bot‑controlled.
- **Return.** When the player reconnects, control returns to them at their next decision. Any decision the bot has already taken stands.
- **In the lobby**, a disconnected player simply loses their seat to a Normal bot after the grace period.

## Room lifetime

- A room with no human connected for **10 minutes** is closed and its game is discarded, whether or not the game was in progress.
- **The last human to leave ends the game.** Leaving mid‑game normally hands your seat to a bot at once. But if every other human seat is already played by a bot (its player left, or stayed away past the grace period), the game would be bots alone, so the room closes instead. A player still inside their grace period counts as at the table. The Leave dialog says which will happen before you confirm.
- State lives in server memory only. A server restart ends all games in progress; players will need to create a new room.

## Timers

- There are **no turn timers**. A connected player may take as long as they like over a decision.
- **Solo rooms** have no hand-result countdown and no grace period (see *Solo rooms*); the clocks on the bots and the trick rest are as below.
- **Hand result: 25 seconds.** When a hand is scored, every seat reads the result and presses Ready; bots confirm at once. The next hand is dealt as soon as all four seats are ready, or when the 25 seconds run out, whichever comes first. The dialog shows who is ready and a ring counting down the time left.
- **After a trick: 1.5 seconds.** When a trick is taken, the table rests before the bots' next turn begins, so everyone can see the finished trick before it is gathered to the winners' pile. Each bot's usual reply time follows the rest, so it never changes how long a bot thinks. A human who leads sooner may do so.
- These, the bots' reply times and the grace period are the only clocks in the game.

## Communication

- There is **no chat**. The rules forbid table talk between partners, and the application does not offer any channel for it.

## Error handling

- An illegal action from a human is rejected with a message and the table view is re‑sent; the game does not advance.
- An illegal action from a bot is a defect: it is logged, and the server plays a legal fallback so the game never stalls.
