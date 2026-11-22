import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as motion from '../src/theme/motion';

/*
 * The script side of the design tokens. Stylelint keeps raw values out of the CSS; this keeps
 * them out of the components' Motion props, and keeps theme/motion.ts in step with the
 * durations and curves in theme/tokens.css.
 */

const SRC = join(__dirname, '../src');
const THEME = join(SRC, 'theme');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return path === THEME ? [] : sources(path);
    return /\.tsx?$/.test(e.name) ? [path] : [];
  });
}

/** Timing written straight into a component instead of taken from theme/motion.ts. */
const RAW_MOTION = [
  { what: 'a spring', pattern: /\btype:\s*['"]spring['"]|\b(stiffness|damping|mass):\s*[\d.]/ },
  { what: 'a duration or delay', pattern: /\b(duration|delay):\s*-?[\d.]/ },
  // A named curve such as 'easeInOut' (linear is fine as it is).
  { what: 'a named easing', pattern: /\bease:.*['"](?!linear['"])[a-zA-Z]+['"]/ },
];

describe('design tokens', () => {
  const tokensCss = readFileSync(join(THEME, 'tokens.css'), 'utf8');

  it('keeps raw springs, durations and easings out of the components', () => {
    const found: string[] = [];
    for (const file of sources(SRC)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const { what, pattern } of RAW_MOTION) {
            if (pattern.test(line)) found.push(`${relative(SRC, file)}:${i + 1} has ${what}`);
          }
        });
    }
    // Use a preset or constant from src/theme/motion.ts, or add one there.
    expect(found).toEqual([]);
  });

  it('uses the shared Button for every ordinary button', () => {
    // Game pieces that are buttons draw themselves; anything else is a <Button>.
    const PIECES = [
      'components/ui/Button.tsx',
      'components/CardFace.tsx', // a card
      'components/TrumpPicker.tsx', // the trump tokens
      'components/BidPlaques.tsx', // your bid plaque
      'components/HowToPlay.tsx', // the guide's topic tabs
      'screens/Lobby.tsx', // the bot level switch
    ];
    const plain = sources(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes('<button'))
      .map((f) => relative(SRC, f))
      .filter((f) => !PIECES.includes(f));
    expect(plain).toEqual([]);
  });

  it('loads the tokens before any component, so the cascade layers keep their order', () => {
    // A layer ranks by where it is first seen: if a component's styles (in the ui layer)
    // loaded before tokens.css declares "base, ui", base would win over every Button.
    const main = readFileSync(join(SRC, 'main.tsx'), 'utf8');
    const firstImport = main.match(/^import .*$/m)?.[0];
    expect(firstImport).toBe("import './theme/tokens.css';");
    expect(tokensCss).toMatch(/^@layer base, ui;$/m);
  });

  const token = (name: string) => {
    const m = tokensCss.match(new RegExp(`--${name}:\\s*([^;]+);`));
    if (!m?.[1]) throw new Error(`no --${name} in tokens.css`);
    return m[1].trim();
  };
  const ms = (value: string) =>
    value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000;
  const curve = (value: string) =>
    value
      .replace(/^cubic-bezier\(|\)$/g, '')
      .split(',')
      .map(Number);

  it.each([
    ['dur-fast', motion.DUR_FAST_MS],
    ['dur-base', motion.DUR_BASE_MS],
    ['dur-slow', motion.DUR_SLOW_MS],
    ['dur-slower', motion.DUR_SLOWER_MS],
    ['dur-tick', motion.DUR_TICK_MS],
  ])('mirrors --%s in motion.ts', (name, value) => {
    expect(ms(token(name))).toBe(value);
  });

  it.each([
    ['ease-out', motion.EASE_OUT],
    ['ease-in-out', motion.EASE_IN_OUT],
  ])('mirrors --%s in motion.ts', (name, value) => {
    expect(curve(token(name))).toEqual([...value]);
  });
});
