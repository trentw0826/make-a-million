import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { kindOf, parseTokens } from '../src/styleguide/tokens';

describe('the style guide’s token list', () => {
  const css = readFileSync(join(__dirname, '../src/theme/tokens.css'), 'utf8');
  const groups = parseTokens(css);
  const names = groups.flatMap((g) => g.tokens.map((t) => t.name));

  it('lists every token in the first :root block of tokens.css, once', () => {
    const root = css.slice(css.indexOf(':root {'), css.indexOf('\n}'));
    const declared = [...root.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]);
    expect(names).toEqual(declared);
  });

  it('groups them under the file’s section headings', () => {
    const titles = groups.map((g) => g.title);
    expect(titles).toContain('Colour: table');
    expect(titles).toContain('Spacing');
    const spacing = groups.find((g) => g.title === 'Spacing');
    expect(spacing?.tokens[0]).toEqual({ name: '--space-1', value: '2px' });
  });

  it('draws each by what kind of value it is', () => {
    expect(kindOf('Colour: table', { name: '--felt', value: '#1f5f3b' })).toBe('colour');
    expect(kindOf('Type', { name: '--text-sm', value: '0.85rem' })).toBe('size');
    expect(kindOf('Stacking', { name: '--z-modal', value: '10' })).toBe('value');
  });
});
