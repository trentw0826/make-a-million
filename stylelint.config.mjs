/**
 * Stylelint guards the client's design tokens: outside apps/client/src/theme/tokens.css,
 * colours, type, spacing, radii, stacking, opacity and timing must come from a token
 * (`var(--…)`). Biome handles formatting and everything else about CSS.
 *
 * If a value has no token, add one to tokens.css (on a scale, if it belongs to one) rather
 * than writing it raw. A genuine exception takes a disable comment that says why.
 */

/** A value made only of the named tokens (and the listed keywords), space-separated. */
const only = (prefix, ...keywords) =>
  new RegExp(`^((var\\(--${prefix}[a-z0-9-]*\\)|${['0', ...keywords].join('|')})\\s*)+$`);

/** @type {import('stylelint').Config} */
export default {
  reportNeedlessDisables: true,
  reportInvalidScopeDisables: true,
  reportDescriptionlessDisables: true,
  rules: {
    // Colours: tokens only.
    'color-no-hex': true,
    'color-named': 'never',
    'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla', 'color-mix', 'cubic-bezier'],

    // Type, stacking, opacity and corners: each has its own scale.
    'declaration-property-value-allowed-list': {
      'font-size': [only('text-')],
      'font-weight': [only('weight-')],
      'line-height': [only('leading-')],
      'letter-spacing': [only('tracking-')],
      'font-family': [only('font-', 'inherit')],
      font: ['inherit'],
      'z-index': [only('z-')],
      opacity: [/^(0|1|var\(--[a-z0-9-]+\))$/],
      '/^border(-[a-z]+)*-radius$/': [only('radius-', '50%', 'inherit')],
    },

    // Spacing and timing: no raw lengths or durations (fluid units and calc() over tokens
    // are fine).
    'declaration-property-unit-allowed-list': {
      '/^(margin|padding|gap|row-gap|column-gap)/': ['%', 'vh', 'vw', 'dvh'],
      '/^(transition|animation)/': [],
    },
    // Easing curves come from --ease-* too (linear is fine as it is).
    'declaration-property-value-disallowed-list': {
      '/^(transition|animation)/': ['/(?<![\\w-])(ease|ease-in|ease-out|ease-in-out)(?![\\w-])/'],
    },
  },
  overrides: [
    {
      files: ['apps/client/src/theme/tokens.css'],
      rules: {
        'color-no-hex': null,
        'function-disallowed-list': null,
        'declaration-property-value-allowed-list': null,
        'declaration-property-unit-allowed-list': null,
      },
    },
  ],
};
