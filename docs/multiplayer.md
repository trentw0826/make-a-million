# Make‑a‑Million – Multiplayer Rules

How rooms, seats and connections behave. The aim is a small, predictable set of rules that keep a game going when someone's connection drops, without accounts or a database.

## Identity

- **Guests only.** A player chooses a display name; there are no accounts.
- **Session token.** On first contact the server issues a random token, which the browser stores locally. The token is what ties a browser to a seat. Clearing it, or using another browser, counts as a new player.

## Rooms

- **Private codes.** A room is created by a host and identified by a six‑character code. Anyone with the code can join; there is no public listing.
- **Four seats.** Seats are arranged around the table; opposite seats are partners. Every seat starts with a Normal bot. Players **pick their own seats**, and so their own partners, by clicking any seat a bot holds; the bot makes way. A player may stand up and move while the room is in the lobby, and the seat they leave gets a Normal bot again.
- **Bots.** The host may set the difficulty (Easy, Normal, Hard or Expert) of the bot in any seat. A game can start with any mix, including one human and three bots. Each level replies after a fixed delay (700, 900, 1500 and 5000 ms), whatever it decides.
- **Starting.** The host starts the game once at least one human is seated. Seats are locked for the whole game.
- **No spectators and no mid‑game joining.** During a game the only way into a room is to reclaim your own seat with your token.
- **Play again.** After a game ends, the host may start another with the same seats. Scores reset.

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
- **Hand result: 25 seconds.** When a hand is scored, every seat reads the result and presses Ready; bots confirm at once. The next hand is dealt as soon as all four seats are ready, or when the 25 seconds run out, whichever comes first. The dialog shows who is ready and a ring counting down the time left.
- **After a trick: 1.5 seconds.** When a trick is taken, the table rests before the bots' next turn begins, so everyone can see the finished trick before it is gathered to the winners' pile. Each bot's usual reply time follows the rest, so it never changes how long a bot thinks. A human who leads sooner may do so.
- These, the bots' reply times and the grace period are the only clocks in the game.

## Communication

- There is **no chat**. The rules forbid table talk between partners, and the application does not offer any channel for it.

## Error handling

- An illegal action from a human is rejected with a message and the table view is re‑sent; the game does not advance.
- An illegal action from a bot is a defect: it is logged, and the server plays a legal fallback so the game never stalls.
