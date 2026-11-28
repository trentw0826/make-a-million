
# TODO Updates
A scratchpad for future fixes, features, and updates

## Immediate
- [ ] The bottom right button panel should go analysis, undo, redo, score sheet, sound, how to play
- [ ] Reimagine win screen
  - [ ] Include a game review feature similar to chess.com
- [ ] Instead of "Bidders captured $270k, made by $55k" the hand review should say "They captured $270k (made their bid by $55k)", other messages should be similarly rewritten
- [ ] Ensure that the solo move analysis doesn't have vision on the other players' hands
- [ ] When moves are forced in the solo analysis, the badge above the card should say 'forced' rather than 'best'
- [ ] I've realized that widow discarding and trump choosing are logically the same step (even if they happen one after the other in the actual gameplay) given that you discard based on what you're about to choose as trump. Account for this fact in the solo analysis machine by noting which trump is intended to be chosen alongside each discard suggestions
- [ ] Red glow over 'call misdeal' button

## Later
- [ ] Create a design system so that styles and animations are standardized across the entire project (avoid manually copying/individually deciding on fonts, animations, text size, colors, etc for each element)
  - [x] Token scales for type, spacing, colour, radii, stacking, opacity and motion, enforced by Stylelint and `designTokens.test.ts`
  - [x] Shared components (`Button`, `Panel`, `Text`) in `components/ui`, with CSS Modules, so screens compose rather than restyle
  - [x] Clickable elements share one response to hover, press, focus and disabled (the `Button` variants)
  - [ ] Move the rest of `styles.css` into per-component CSS Modules, a component at a time, switching tests and e2e from class hooks to roles or data attributes as each moves
  - [x] Everything clickable presses the same way: `Button` and the game pieces (cards, trump tokens, bid plaque, guide tabs, bot level) share `PRESSABLE`
- [ ] Test UI across different browsers and screen sizes
- [ ] Create a phone-friendly UI
- [ ] 'play along mode' that accompanies a real-life game; You play along with the events of a real game and the board offers you analyses of the current game, including your best moves
- [ ] User move scoring
- [ ] Game review using scoring
- [ ] Different customizable themes/styles (cards, table, etc)
  - [ ] Score sheet theme should look like a lined yellow pages sheet
- [ ] Custom card ordering (if a player perfers RYBG rather than RGBY in their hand)
- [ ] Simplify/re-imagine partner-choosing page
- [ ] User-level feature that allows them to auto-play forced moves (includes a short waiting period with slight randomness to avoid giving away autoplay)

## Usage notes
- [ ] The animation of playing a card is often feels jittery or like it's tearing, particularly when moving the mouse while clicking
