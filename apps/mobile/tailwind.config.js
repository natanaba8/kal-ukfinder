/**
 * NativeWind is the styling engine GlueStack UI v2 is built on.
 *
 * The palette mirrors `src/constants/theme.ts` and the admin panel's tokens so
 * the two products look like one (pr.md §42.16). Screens written before this
 * still use StyleSheet — both approaches coexist, which is what §21's
 * "gradually integrate, don't replace the whole UI" asks for.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: '#0E1726',
        'ink-dim': '#5A6472',
        'ink-faint': '#8A94A3',
        surface: '#F4F6F9',
        card: '#FFFFFF',
        line: '#DFE3EA',
        brand: { DEFAULT: '#1D4E89', soft: '#E7EEF8', ink: '#FFFFFF' },
        accent: { DEFAULT: '#B3123C', soft: '#FBE8EE' },
        good: { DEFAULT: '#0F7A4F', soft: '#E3F4EC' },
        warn: { DEFAULT: '#9A5B00', soft: '#FBF0DF' },

        // Dark scheme, applied through the `dark:` variant.
        'ink-d': '#F2F5F8',
        'ink-dim-d': '#A3AEBB',
        'ink-faint-d': '#78848F',
        'surface-d': '#161C24',
        'card-d': '#141A21',
        'line-d': '#28323D',
        'brand-d': '#7FB0F0',
        'brand-soft-d': '#16283D',
        'accent-d': '#FF7D97',
        'good-d': '#5FD3A0',
        'warn-d': '#E8B064',
      },
      borderRadius: {
        card: '18px',
        control: '12px',
      },
    },
  },
  plugins: [],
};
