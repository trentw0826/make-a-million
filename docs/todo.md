
# TODO Updates
A scratchpad for future fixes, features, and updates

## Immediate

## Later
- [ ] Create a design system so that styles and animations are standardized across the entire project (avoid manually copying/individually deciding on fonts, animations, text size, colors, etc for each element)
  - [x] Token scales for type, spacing, colour, radii, stacking, opacity and motion, enforced by Stylelint and `designTokens.test.ts`
  - [ ] Shared components (`Button`, `Panel`, `Text`) so screens compose rather than restyle; move styles into CSS Modules
  - [ ] A dev-only style guide page of every token and component, screenshotted by `pnpm e2e`
  - [ ] As part of it, clickable/interactable elements should have standardized animations (e.g. the 'pass' button during the bidding phase gives no feedback that it's clickable other than mouse hover state)
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
