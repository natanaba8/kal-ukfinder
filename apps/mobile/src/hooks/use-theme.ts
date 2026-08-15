import { Colors, type Theme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The active palette. Anything other than an explicit "dark" falls back to
 * light, so a null/unspecified scheme never indexes Colors with undefined.
 *
 * https://docs.expo.dev/guides/color-schemes/
 */
export function useTheme(): Theme {
  return Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
