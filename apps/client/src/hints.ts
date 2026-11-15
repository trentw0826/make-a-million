import { cardById, effectiveSuit, isBullOrBear, type Suit, type TrickPlay } from '@mam/engine';

/** The color a trick must follow: set by its first card that is not the Bull or Bear. */
export function trickSuit(plays: readonly TrickPlay[], trump: Suit | null): Suit | null {
  for (const play of plays) {
    const card = cardById(play.cardId);
    if (!isBullOrBear(card)) return effectiveSuit(card, trump);
  }
  return null;
}
