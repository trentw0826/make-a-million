
# TODO Updates
A scratchpad for future fixes, features, and updates

## Immediate
- [ ] Remove the rounded golden border that seems to denote money cards
- [ ] The mouse changes to denote clickable elements like cards
- [ ] When choosing trump, instead of the 4 button multiple choice, the player chooses using the cards in their hand. The player can hover over the different groups (as opposed to hovering over single cards at a time) which gently move upward and 'push' the other groups away, in the same exact manner as happens with choosing a single card. The UI is slightly redesigned to make it clear that the player is being asked to choose trump and a dynamic element lets the player know what color they're about to choose for trump when they're hovered over a color. The special cards go transparent during this process.
- [ ] Increase the size of the cards during the animation that puts them on the table, for easier reading
- [ ] Each player gets their own messy pile of cards they've won (rather than one per partnership). Use your judgement as to the location of each
- [ ] Exiting the score sheet triggers the exact reverse animation of it entering (table un-dims, score sheet slides away) rather than immediately disappearing
- [ ] Rename "score sheet & log" to just "score sheet"
- [ ] Remove "copy invite link" feature
- [ ] Move room code indicator to right side 
- [ ] Creatively re-imagine the landing page to more closely fit the rest of the theme
- [ ] Change the "pass" element in the bidding action box to be a bit more subtle
- [ ] Overlapping invisible cards creates a venn diagram effect that is unnecessarily attention-calling. Brainstorm and implement a way to maintain the transparency effect without the strong overlapping sections


## Later
- [ ] Create a phone-friendly UI
- [] Strong bots: fit Expert to its reply time and offer it; load-test Hard rooms. Details in `docs/bot-roadmap.md
- [ ] Quick solo mode
- [ ] Solo training mode that intelligently critiques a user's gameplay in the moment
- [ ] Different customizable themes/styles (cards, table, etc)
- [ ] Score sheet theme should look like a lined yellow pages sheet
- [ ] Custom card ordering (if a player perfers RYBG rather than RGBY in their hand)

## Usage notes
- [] Not immediately clear to me what the glowing card means, though I like the look of the effect
- [ ] The animation of playing a card is often feels jittery or like it's tearing, particularly when moving the mouse while clicking