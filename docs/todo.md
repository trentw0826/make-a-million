
# TODO Updates
A scratchpad for future fixes, features, and updates

## Immediate
- [ ] Remove the UI element in the action box explaining what the player is waiting on (such as "Waiting for bot 2 to bid"). This element should still show up for bidding
- [ ] The bidding bar currently looks like "-   215k   + [Bid 215k] Pass". Instead, have a single button that says "[Bid 215k]" in the middle with decrement, increment buttons to the immediate left, immediate right of it. On the right hand side of the action bar, move the "Pass" button. Incrementing or decrementing updates the value shown on the button itself rather than a second element
- [ ] Remove the current bid indicator under the user once they've been out-bid (that bid is no longer relevant)
- [ ] Add a slightly wider separation between the groups of cards of different colors within the player's hand
- [ ] The discard button should be the only element in the discord action box with the prompt "Discard (3 left)", then "Discard (2 left)", etc until just "Discard" 

## Later
- [ ] Create a phone-friendly UI
- [] Strong bots: fit Expert to its reply time and offer it; load-test Hard rooms. Details in `docs/bot-roadmap.md
- [ ] When choosing trump, instead of the 4 button multiple choice, the different colors are grouped
- [ ] Quick solo mode
- [ ] Solo training mode that intelligently critiques a user's gameplay in the moment
- [ ] Different customizable themes/styles (cards, table, etc)
- [ ] Score sheet theme should look like a lined yellow pages sheet

## Usage notes
- [] Not immediately clear to me what the glowing card means, though I like the look of the effect
- [ ] The animation of playing a card is often feels jittery or like it's tearing, particularly when moving the mouse while clicking