import { useId } from 'react';
import { cardBackArt } from './manifest';

/**
 * The back of a card: the artwork from the manifest when there is some, otherwise a
 * placeholder lattice with a gold "M" medallion. Fills its parent; decorative.
 */
export function CardBackArt() {
  const id = useId();
  if (cardBackArt) {
    return <img className="card-back-art" src={cardBackArt} alt="" draggable={false} />;
  }
  // useId's characters are not all valid inside url(#…).
  const pattern = `lattice-${id.replace(/[^\w-]/g, '')}`;
  return (
    <svg
      className="card-back-art"
      viewBox="0 0 60 90"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={pattern} width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" style={{ fill: 'var(--back)' }} />
          <path d="M0 0l8 8M8 0L0 8" style={{ stroke: 'var(--back-dark)' }} strokeWidth="1.6" />
        </pattern>
      </defs>
      <rect width="60" height="90" fill={`url(#${pattern})`} />
      <rect
        x="4"
        y="4"
        width="52"
        height="82"
        rx="3"
        fill="none"
        style={{ stroke: 'var(--back-trim)' }}
        strokeWidth="1.2"
        opacity="0.8"
      />
      <circle
        cx="30"
        cy="45"
        r="11"
        strokeWidth="1.5"
        style={{ fill: 'var(--back-dark)', stroke: 'var(--accent-light)' }}
      />
      <text
        x="30"
        y="50.5"
        textAnchor="middle"
        fontSize="15"
        fontWeight="bold"
        style={{ fontFamily: 'var(--font-display)', fill: 'var(--accent-light)' }}
      >
        M
      </text>
    </svg>
  );
}
