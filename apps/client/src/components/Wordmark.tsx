import styles from './Wordmark.module.css';

/**
 * The game's name as a mark: a gold coin and the title in the display face. A placeholder
 * until there is a real logo; the text stays real text so it reads as "Make‑a‑Million".
 */
export function Wordmark({ size = 'normal' }: { size?: 'normal' | 'large' }) {
  return (
    <span className={size === 'large' ? `${styles.wordmark} ${styles.large}` : styles.wordmark}>
      <svg className={styles.coin} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle className={styles.coinFace} cx="12" cy="12" r="11" />
        <circle className={styles.coinRim} cx="12" cy="12" r="8.5" strokeWidth="1.2" />
        <text className={styles.coinMark} x="12" y="16.5" textAnchor="middle" fontSize="13">
          $
        </text>
      </svg>
      <span>
        Make‑a‑<span className={styles.million}>Million</span>
      </span>
    </span>
  );
}
