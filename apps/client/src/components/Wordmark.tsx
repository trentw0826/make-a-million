/**
 * The game's name as a mark: a gold coin and the title in the display face. A placeholder
 * until there is a real logo; the text stays real text so it reads as "Make‑a‑Million".
 */
export function Wordmark({ size = 'normal' }: { size?: 'normal' | 'large' }) {
  return (
    <span className={`wordmark wordmark-${size}`}>
      <svg className="wordmark-coin" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="11" style={{ fill: 'var(--accent)' }} />
        <circle
          cx="12"
          cy="12"
          r="8.5"
          fill="none"
          style={{ stroke: 'var(--accent-light)' }}
          strokeWidth="1.2"
        />
        <text
          x="12"
          y="16.5"
          textAnchor="middle"
          fontSize="13"
          fontWeight="bold"
          style={{ fontFamily: 'var(--font-display)', fill: 'var(--bar)' }}
        >
          $
        </text>
      </svg>
      <span className="wordmark-text">
        Make‑a‑<span className="wordmark-million">Million</span>
      </span>
    </span>
  );
}
