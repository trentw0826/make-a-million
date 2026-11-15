import { type Card, type CardId, cardById, cardLabel, isMoney } from '@mam/engine';
import { SUIT_NAMES } from '../format';

export interface CardFaceProps {
  readonly id: CardId;
  readonly size?: 'normal' | 'small';
  readonly selected?: boolean | undefined;
  /** A card the player may not play right now. */
  readonly disabled?: boolean | undefined;
  readonly onClick?: (() => void) | undefined;
}

function subtitle(card: Card): string {
  if (card.kind === 'suit') return SUIT_NAMES[card.suit];
  if (card.kind === 'tiger') return 'top trump';
  if (card.kind === 'bull') return 'doubles';
  return 'cancels';
}

/** A card drawn as colored text on a plain face. There is no artwork by design. */
export function CardFace({ id, size = 'normal', selected, disabled, onClick }: CardFaceProps) {
  const card = cardById(id);
  const kind = card.kind === 'suit' ? card.suit : card.kind;
  const classes = ['card', `card-${kind}`, `card-${size}`];
  if (selected) classes.push('card-selected');
  if (disabled) classes.push('card-disabled');
  if (card.kind === 'suit' && isMoney(card)) classes.push('card-money');

  const label = cardLabel(card);
  const name = `${label} ${subtitle(card)}`;
  const content = (
    <>
      <span className="card-label">{label}</span>
      <span className="card-sub">{subtitle(card)}</span>
    </>
  );

  if (!onClick) {
    return (
      <div className={classes.join(' ')} role="img" aria-label={name}>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={classes.join(' ')}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected ?? false}
      aria-label={name}
    >
      {content}
    </button>
  );
}

export function CardBack({ count }: { count: number }) {
  const offsets = Array.from({ length: Math.min(count, 13) }, (_, i) => i * 9);
  return (
    <div className="card-backs" role="img" aria-label={`${count} cards`}>
      {offsets.map((left) => (
        <span className="card-back" key={left} style={{ left: `${left}px` }} />
      ))}
      <span className="card-back-count">{count}</span>
    </div>
  );
}
