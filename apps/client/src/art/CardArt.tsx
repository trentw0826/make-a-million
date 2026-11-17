import { type Card, isMoney, type Suit } from '@mam/engine';
import type { ReactNode } from 'react';
import { cardFaceArt } from './manifest';

/**
 * Placeholder emblems: a shape for each color as well as its hue, so the suits stay apart
 * for color-blind players too. Drawn in a 40×40 box, filled with `currentColor`.
 */
const SUIT_GLYPH: Record<Suit, ReactNode> = {
  red: <circle cx="20" cy="20" r="14" />,
  yellow: (
    <path d="M20 4l4.7 10.1 11 1.2-8.2 7.5 2.3 10.9L20 28.2l-9.8 5.5 2.3-10.9-8.2-7.5 11-1.2z" />
  ),
  black: <rect x="7" y="7" width="26" height="26" rx="3" />,
  green: <path d="M20 5l16 28H4z" />,
};

/** A color's emblem on its own, filled with `currentColor`. */
export function SuitGlyph({ suit, className }: { suit: Suit; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">
      {SUIT_GLYPH[suit]}
    </svg>
  );
}

const SPECIAL_GLYPH: Record<'tiger' | 'bull' | 'bear', ReactNode> = {
  // Three claw stripes.
  tiger: (
    <g fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round">
      <path d="M12 11c3 5 3 13 0 18" />
      <path d="M20 9c3 6 3 16 0 22" />
      <path d="M28 11c3 5 3 13 0 18" />
    </g>
  ),
  // A head between two horns.
  bull: (
    <g>
      <path
        d="M6 10c0 6 4 9 9 9M34 10c0 6-4 9-9 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <ellipse cx="20" cy="24" rx="8" ry="9" />
    </g>
  ),
  // A round head with two ears.
  bear: (
    <g>
      <circle cx="11" cy="12" r="5" />
      <circle cx="29" cy="12" r="5" />
      <circle cx="20" cy="23" r="12" />
    </g>
  ),
};

/**
 * The picture on a card's face, behind its index. Draws the artwork from the manifest when
 * there is some, otherwise a placeholder emblem. Decorative: the card itself carries the name.
 */
export function CardArt({ card }: { card: Card }) {
  const url = cardFaceArt(card);
  if (url) return <img className="card-art card-art-image" src={url} alt="" draggable={false} />;

  const special = card.kind !== 'suit';
  const glyph = card.kind === 'suit' ? SUIT_GLYPH[card.suit] : SPECIAL_GLYPH[card.kind];
  const classes = ['card-art', special ? 'card-art-special' : 'card-art-suit'];
  if (card.kind === 'suit' && isMoney(card)) classes.push('card-art-money');
  return (
    <svg className={classes.join(' ')} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      {special && <circle className="card-art-medallion" cx="20" cy="20" r="19" />}
      <g fill="currentColor">{glyph}</g>
    </svg>
  );
}
