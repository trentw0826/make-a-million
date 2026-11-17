import type { TrickPlay } from '@mam/engine';
import { motion } from 'motion/react';
import type { CSSProperties } from 'react';
import { CardBackArt } from '../art/CardBackArt';
import { TRICK_SWEEP_MS } from '../theme/motion';
import { CardFace } from './CardFace';
import { cardLayoutId } from './TrickArea';

interface Props {
  /** Whose pile it is, for its accessible name: "Your", or a player's name. */
  readonly owner: string;
  readonly side: 'us' | 'them';
  /** Tricks already in the pile. */
  readonly count: number;
  /** The trick being gathered into it now, if any: its cards fly here from the felt. */
  readonly incoming: readonly TrickPlay[] | null;
  readonly className?: string;
}

/** Where card `k` of the pile's trick `t` lies: a loose stack, the same every time. */
function lie(t: number, k: number): { x: number; y: number; rotate: number } {
  return {
    x: (((t * 7 + k * 3) % 5) - 2) * 2.2,
    y: -t * 1.6 + (((t + k * 2) % 3) - 1) * 1.5,
    rotate: (((t * 13 + k * 5) % 9) - 4) * 2.5,
  };
}

const CARDS_PER_TRICK = 4;

/**
 * A player's taken tricks, face down in a loose pile on their left. Only how many tricks
 * there are shows, never what is in them (see "Table Visibility" in game-rules.md). A trick
 * being gathered is drawn here already: its cards share their layout ids with their places
 * on the felt, so Motion flies them in, turning them over on the way.
 */
export function TrickPile({ owner, side, count, incoming, className }: Props) {
  const taken = count + (incoming ? 1 : 0);
  return (
    <div
      className={`trick-pile pile-${side}${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={`${owner}: ${taken} ${taken === 1 ? 'trick' : 'tricks'} taken`}
    >
      {Array.from({ length: count }, (_, t) =>
        Array.from({ length: CARDS_PER_TRICK }, (_, k) => {
          const { x, y, rotate } = lie(t, k);
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: a pile only grows; positions are its identity
              key={`${t}-${k}`}
              className="pile-card"
              style={
                { transform: `translate(${x}px, ${y}px) rotate(${rotate}deg)` } as CSSProperties
              }
            >
              <CardBackArt />
            </span>
          );
        }),
      )}
      {incoming?.map((play, k) => (
        <motion.div
          key={play.cardId}
          layoutId={cardLayoutId(play.cardId)}
          className="pile-card trick-sweep"
          style={lie(count, k)}
          transition={{ layout: { duration: TRICK_SWEEP_MS / 1000, ease: 'easeInOut' } }}
        >
          <motion.div
            className="card-3d"
            initial={{ rotateY: 0 }}
            animate={{ rotateY: 180 }}
            transition={{ duration: TRICK_SWEEP_MS / 1000, ease: 'easeInOut' }}
          >
            <CardFace id={play.cardId} size="small" />
            <div className="card-3d-back" aria-hidden="true">
              <CardBackArt />
            </div>
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}
