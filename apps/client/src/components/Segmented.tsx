import type { CSSProperties } from 'react';
import { PRESSABLE } from './ui/pressable';

/**
 * A choice of a few, such as a bot's level: equal slots on the felt, with a highlight that
 * slides under the chosen one. Picking the chosen one again does nothing.
 */
export function Segmented<T extends string>(p: {
  label: string;
  options: readonly T[];
  value: T;
  text: (option: T) => string;
  onChange: (option: T) => void;
}) {
  return (
    <fieldset
      className="segmented"
      aria-label={p.label}
      style={{ '--at': p.options.indexOf(p.value) } as CSSProperties}
    >
      <span className="segmented-thumb" aria-hidden="true" />
      {p.options.map((o) => (
        <button
          key={o}
          type="button"
          className={PRESSABLE}
          aria-pressed={p.value === o}
          onClick={() => p.value !== o && p.onChange(o)}
        >
          {p.text(o)}
        </button>
      ))}
    </fieldset>
  );
}
