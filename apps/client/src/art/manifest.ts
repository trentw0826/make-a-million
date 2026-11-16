import type { Card } from '@mam/engine';

/**
 * Where the game's artwork comes from. Every entry is `null` for now, which means "draw the
 * placeholder" (CardArt.tsx, CardBackArt.tsx). To bring in real art, put the files in
 * `src/art/files/`, import them here and return their URLs: Vite fingerprints them into
 * `/assets/`, which the server caches as immutable. Faces may come one at a time; any card
 * still returning `null` keeps its placeholder.
 *
 * The felt's texture is a CSS token (`--felt-texture` in theme/tokens.css), since only CSS
 * draws it.
 */

/** Artwork for a card's face, or null for the placeholder. */
export function cardFaceArt(_card: Card): string | null {
  return null;
}

/** Artwork for the card back, or null for the placeholder. */
export const cardBackArt: string | null = null;
