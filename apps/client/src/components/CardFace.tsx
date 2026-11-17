import { type Card, type CardId, cardById, cardLabel, isMoney } from '@mam/engine';
import { CardArt } from '../art/CardArt';
import { CardBackArt } from '../art/CardBackArt';
import { SUIT_NAMES } from '../format';

export interface CardFaceProps {
  readonly id: CardId;
  readonly size?: 'normal' | 'small';
  readonly selected?: boolean | undefined;
  /**
   * A card the player may not play right now. It stays focusable and hoverable (aria-disabled,
   * not `disabled`) so its tooltip shows in every browser; clicks go to `onBlockedClick`.
   */
  readonly disabled?: boolean | undefined;
  readonly onClick?: (() => void) | undefined;
  /** A click on a disabled card, e.g. to say why it can't be played. */
  readonly onBlockedClick?: (() => void) | undefined;
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

/**
 * A card: its index in the corner, its name below, and its picture (CardArt: the artwork
 * from the manifest, or a placeholder emblem) in the middle.
 */
export function CardFace({
  id,
  size = 'normal',
  selected,
  disabled,
  onClick,
  onBlockedClick,
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
      <CardArt card={card} />
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
      onClick={disabled ? onBlockedClick : onClick}
      aria-disabled={disabled || undefined}
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
  const shown = Math.min(count, 13);
  const offsets = Array.from({ length: shown }, (_, i) => i * 9);
  // As wide as the fan itself, so it centres under the name however many cards are left.
  const width = `calc(${Math.max(shown - 1, 0) * 9}px + var(--back-w))`;
  return (
    <div className="card-backs" role="img" aria-label={`${count} cards`} style={{ width }}>
      {offsets.map((left) => (
        <span className="card-back" key={left} style={{ left: `${left}px` }}>
          <CardBackArt />
        </span>
      ))}
    </div>
  );
}
