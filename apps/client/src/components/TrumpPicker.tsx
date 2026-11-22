import { cardById, type LegalMoves, type Suit } from '@mam/engine';
import { SuitGlyph } from '../art/CardArt';
import { SUIT_NAMES } from '../format';
import { useGame } from '../store';
import { PRESSABLE } from './ui/pressable';

/**
 * Naming trump, in the middle of the felt: a token for each color, with how many of it the
 * hand holds. A click on a token names it; so does a click on a card of that color in the
 * hand, and pointing at one there lights its token.
 */
export function TrumpPicker({
  legal,
  hand,
  preview,
}: {
  legal: Extract<LegalMoves, { kind: 'trump' }>;
  hand: readonly number[];
  /** The color the pointer is on in the hand. */
  preview: Suit | null;
}) {
  const { act } = useGame();
  const held = (suit: Suit) =>
    hand.filter((id) => {
      const card = cardById(id);
      return card.kind === 'suit' && card.suit === suit;
    }).length;
  return (
    <section className="trump-picker" aria-label="Choose trump">
      <p className="felt-label">Choose trump</p>
      <div className="trump-picks">
        {legal.suits.map((suit) => {
          const n = held(suit);
          return (
            <button
              type="button"
              key={suit}
              className={`trump-pick suit-${suit}${preview === suit ? ' trump-pick-lit' : ''} ${PRESSABLE}`}
              aria-label={`${SUIT_NAMES[suit]}, ${n} in your hand`}
              onClick={() => act({ type: 'nameTrump', suit })}
            >
              <SuitGlyph suit={suit} className="trump-pick-glyph" />
              <span className="trump-pick-name">{SUIT_NAMES[suit]}</span>
              <span className="trump-pick-count" aria-hidden="true">
                {n} held
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
