import { type CardId, cardById, isTrump, type Suit } from '@mam/engine';
import { type CSSProperties, useMemo } from 'react';
import { displayGroup, displayOrder } from '../handOrder';
import { useFlip } from '../useFlip';
import { CardFace, type CardFaceProps } from './CardFace';

interface Props {
  readonly ids: readonly CardId[];
  readonly trump: Suit | null;
  /** Per-card state from the table: selection, legality, widow mark, tooltip. */
  readonly cardProps: (id: CardId) => Omit<CardFaceProps, 'id' | 'trump'>;
}

/**
 * The player's own cards, grouped by color, the trump group first once it is named. Mount a
 * fresh Hand for each deal (key it by deal) so the cards are dealt in again.
 */
export function Hand({ ids, trump, cardProps }: Props) {
  const order = useMemo(() => displayOrder(ids, trump), [ids, trump]);
  const flip = useFlip(order);
  return (
    <section className="hand" aria-label="Your hand">
      {order.map((id, i) => {
        const prev = order[i - 1];
        const newGroup =
          prev !== undefined && displayGroup(prev, trump) !== displayGroup(id, trump);
        return (
          <div
            key={id}
            ref={flip(id)}
            className={newGroup ? 'hand-slot group-start' : 'hand-slot'}
            style={{ '--i': i } as CSSProperties}
          >
            <CardFace
              id={id}
              {...cardProps(id)}
              trump={trump !== null && isTrump(cardById(id), trump)}
            />
          </div>
        );
      })}
    </section>
  );
}
