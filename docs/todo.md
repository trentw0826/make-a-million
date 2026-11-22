
# TODO Updates
A scratchpad for future fixes, features, and updates

## Immediate + Simple
- [ ] Put the pile of won cards for each time centered underneath their score trackers in their respective corners


## Later
- [ ] Create a design system so that styles and animations are standardized across the entire project (avoid manually copying/individually deciding on fonts, animations, text size, colors, etc for each element)
  - [x] Token scales for type, spacing, colour, radii, stacking, opacity and motion, enforced by Stylelint and `designTokens.test.ts`
  - [x] Shared components (`Button`, `Panel`, `Text`) in `components/ui`, with CSS Modules, so screens compose rather than restyle
  - [x] Clickable elements share one response to hover, press, focus and disabled (the `Button` variants)
  - [ ] Move the rest of `styles.css` into per-component CSS Modules, a component at a time, switching tests and e2e from class hooks to roles or data attributes as each moves
  - [ ] Give the game pieces that are buttons (cards, trump tokens, bid plaque, guide tabs, bot level) the same press and focus response
  - [ ] A dev-only style guide page of every token and component, screenshotted by `pnpm e2e`
- [ ] Test UI across different browsers and screen sizes
- [ ] Create a phone-friendly UI
- [] Strong bots: fit Expert to its reply time and offer it; load-test Hard rooms. Details in `docs/bot-roadmap.md`
- [ ] Solo mode
  - [ ] Includes undo/redo
- [ ] User move scoring
- [ ] Game review using scoring
- [ ] Different customizable themes/styles (cards, table, etc)
- [ ] Score sheet theme should look like a lined yellow pages sheet
- [ ] Custom card ordering (if a player perfers RYBG rather than RGBY in their hand)
- [ ] Reimagine landing page
- [ ] Reimagine partner-choosing page
- [ ] Reimagine win screen

## Usage notes
- [ ] The animation of playing a card is often feels jittery or like it's tearing, particularly when moving the mouse while clicking
