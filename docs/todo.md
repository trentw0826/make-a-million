
# TODO Updates
A scratchpad for future fixes, features, and updates

## Immediate + Simple
- [] Remove "Bot 4 bid $205,000 in Red" portion of hand review
- [ ] The bottom right button panel should go analysis, undo, redo, score sheet, sound, how to play
- [ ] Instead of subtle 'Discard 3/3' text during discard phase, the discard button itself should read 'Discard 3 More', 'Discard 2 More', etc in an unclickable design until all 3 have been discarded, at which point it becomes the clickable 'Discard' button
- [ ] Remove the 'x held' text under the choosing trump UI
- [ ] When hovering over the color group to be chosen as trump, the corresponding color box on the table hovers as if about to be chosen; this should also be true in reverse but isn't
- [ ] Reimagine win screen
  - [ ] Elements should be more harmonious with the design system. Include a simple confetti animation + sound when winning. 
  - [ ] Include a game review feature similar to chess.com
- [ ] Trump cards have a thin gold outline rather than a gold star

## Later
- [ ] Create a design system so that styles and animations are standardized across the entire project (avoid manually copying/individually deciding on fonts, animations, text size, colors, etc for each element)
  - [x] Token scales for type, spacing, colour, radii, stacking, opacity and motion, enforced by Stylelint and `designTokens.test.ts`
  - [x] Shared components (`Button`, `Panel`, `Text`) in `components/ui`, with CSS Modules, so screens compose rather than restyle
  - [x] Clickable elements share one response to hover, press, focus and disabled (the `Button` variants)
  - [ ] Move the rest of `styles.css` into per-component CSS Modules, a component at a time, switching tests and e2e from class hooks to roles or data attributes as each moves
  - [x] Everything clickable presses the same way: `Button` and the game pieces (cards, trump tokens, bid plaque, guide tabs, bot level) share `PRESSABLE`
  - [ ] A dev-only style guide page of every token and component, screenshotted by `pnpm e2e`
- [ ] Test UI across different browsers and screen sizes
- [ ] Create a phone-friendly UI
- [] Strong bots: fit Expert to its reply time and offer it; load-test Hard rooms. Details in `docs/bot-roadmap.md`
- [ ] Solo mode
  - [ ] Includes undo/redo
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
