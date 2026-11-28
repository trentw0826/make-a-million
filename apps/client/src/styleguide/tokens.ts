/** One custom property from tokens.css, with the section it sits in and its comment. */
export interface Token {
  readonly name: string;
  readonly value: string;
}

export interface TokenGroup {
  readonly title: string;
  readonly tokens: readonly Token[];
}

/**
 * The tokens declared in the first `:root` block of tokens.css, grouped by its section
 * headings ("Colour: table ---", "Spacing ---"). Read from the file itself, so the style guide
 * lists every token there is without a second list to keep in step.
 */
export function parseTokens(css: string): TokenGroup[] {
  const start = css.indexOf(':root {');
  const end = css.indexOf('\n}', start);
  const body = start < 0 || end < 0 ? '' : css.slice(start, end);
  const groups: { title: string; tokens: Token[] }[] = [];
  for (const line of body.split('\n')) {
    const heading = line.match(/^\s*\/\*\s*(.+?)\s*-{3,}\s*\*\/\s*$/);
    if (heading?.[1]) {
      groups.push({ title: heading[1], tokens: [] });
      continue;
    }
    const decl = line.match(/^\s*(--[\w-]+):\s*(.+?);?\s*(\/\*.*)?$/);
    if (decl?.[1] && decl[2]) {
      if (groups.length === 0) groups.push({ title: 'Other', tokens: [] });
      const value = decl[2].replace(/;$/, '');
      // A long value (an inline image) is cut short: the name says what it is.
      const shown = value.length > 60 ? `${value.slice(0, 57)}…` : value;
      groups.at(-1)?.tokens.push({ name: decl[1], value: shown });
    }
  }
  return groups.filter((g) => g.tokens.length > 0);
}

/** How the style guide shows a token: by what kind of value it is. */
export type TokenKind =
  | 'colour'
  | 'font'
  | 'size'
  | 'space'
  | 'radius'
  | 'shadow'
  | 'opacity'
  | 'value';

export function kindOf(group: string, token: Token): TokenKind {
  if (group.startsWith('Colour')) return 'colour';
  if (token.name.startsWith('--font-')) return 'font';
  if (token.name.startsWith('--text-')) return 'size';
  if (token.name.startsWith('--space-')) return 'space';
  if (token.name.startsWith('--radius-')) return 'radius';
  if (token.name.startsWith('--shadow-')) return 'shadow';
  if (group.startsWith('Opacity')) return 'opacity';
  return 'value';
}
