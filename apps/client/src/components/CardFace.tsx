import { type Card, type CardId, cardById, cardLabel, isMoney } from '@mam/engine';
import { SUIT_NAMES } from '../format';

export interface CardFaceProps {
  readonly id: CardId;
  readonly size?: 'normal' | 'small';
  readonly selected?: boolean | undefined;
  /** A card the player may not play right now. */
  readonly disabled?: boolean | undefined;
  readonly onClick?: (() => void) | undefined;
  /** A trump card (the trump color or the Tiger), marked once trump is named. */
  readonly trump?: boolean | undefined;
  /** Just picked up from the widow. */
  readonly fresh?: boolean | undefined;
  /** The card winning the trick. */
  readonly winning?: boolean | undefined;
  /** Tooltip, e.g. why the card can't be played. */
  readonly title?: string | undefined;
}

function subtitle(card: Card): string {
  if (card.kind === 'suit') return SUIT_NAMES[card.suit];
  if (card.kind === 'tiger') return 'top trump';
  if (card.kind === 'bull') return 'doubles';
  return 'cancels';
}

/** A card drawn as colored text on a plain face. There is no artwork by design. */
export function CardFace({
  id,
  size = 'normal',
  selected,
  disabled,
  onClick,
  trump,
  fresh,
  winning,
  title,
}: CardFaceProps) {
  const card = cardById(id);
  const kind = card.kind === 'suit' ? card.suit : card.kind;
  const classes = ['card', `card-${kind}`, `card-${size}`];
  if (selected) classes.push('card-selected');
  if (disabled) classes.push('card-disabled');
  if (card.kind === 'suit' && isMoney(card)) classes.push('card-money');
  if (trump) classes.push('card-trump');
  if (fresh) classes.push('card-fresh');
  if (winning) classes.push('card-winning');

  const label = cardLabel(card);
  const notes = [trump && 'trump', fresh && 'from the widow', winning && 'winning'].filter(Boolean);
  const name = [`${label} ${subtitle(card)}`, ...notes].join(', ');
  const content = (
    <>
      {trump && (
        <span className="card-star" aria-hidden="true">
          ★
        </span>
      )}
      {fresh && (
        <span className="card-tag" aria-hidden="true">
          new
        </span>
      )}
      <span className="card-label">{label}</span>
      <span className="card-sub">{subtitle(card)}</span>
    </>
  );
  const data = { 'data-card-id': id, 'data-trump': trump || undefined };

  if (!onClick) {
    return (
      <div className={classes.join(' ')} role="img" aria-label={name} title={title} {...data}>
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
      title={title}
      {...data}
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
