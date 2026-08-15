/**
 * Kal-UKFinder design tokens.
 *
 * Every colour is defined for both schemes so `useTheme()` can be indexed by
 * key anywhere in the app. Add a token to both objects or TypeScript will
 * complain at the `ThemeColor` type.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0E1726',
    textSecondary: '#5A6472',
    textMuted: '#8A94A3',
    background: '#FFFFFF',
    backgroundElement: '#F4F6F9',
    backgroundSelected: '#E6EBF2',
    card: '#FFFFFF',
    border: '#DFE3EA',
    primary: '#1D4E89',
    primarySoft: '#E7EEF8',
    onPrimary: '#FFFFFF',
    accent: '#B3123C',
    accentSoft: '#FBE8EE',
    success: '#0F7A4F',
    successSoft: '#E3F4EC',
    warning: '#9A5B00',
    warningSoft: '#FBF0DF',
  },
  dark: {
    text: '#F2F5F8',
    textSecondary: '#A3AEBB',
    textMuted: '#78848F',
    background: '#0B0F14',
    backgroundElement: '#161C24',
    backgroundSelected: '#212A34',
    card: '#141A21',
    border: '#28323D',
    primary: '#7FB0F0',
    primarySoft: '#16283D',
    onPrimary: '#08121F',
    accent: '#FF7D97',
    accentSoft: '#3A1520',
    success: '#5FD3A0',
    successSoft: '#10281F',
    warning: '#E8B064',
    warningSoft: '#2B2113',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
/** `as const` makes each palette a set of string literals — widen it to plain strings. */
export type Theme = Record<ThemeColor, string>;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
  seven: 48,
} as const;

export const Radius = {
  small: 8,
  medium: 12,
  large: 18,
  pill: 999,
} as const;

export const MaxContentWidth = 760;
