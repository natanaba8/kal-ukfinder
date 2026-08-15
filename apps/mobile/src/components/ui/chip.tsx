import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'neutral' | 'primary' | 'accent' | 'success' | 'warning';
  size?: 'small' | 'medium';
};

const TONE_COLORS: Record<
  NonNullable<ChipProps['tone']>,
  { background: ThemeColor; text: ThemeColor }
> = {
  neutral: { background: 'backgroundElement', text: 'textSecondary' },
  primary: { background: 'primarySoft', text: 'primary' },
  accent: { background: 'accentSoft', text: 'accent' },
  success: { background: 'successSoft', text: 'success' },
  warning: { background: 'warningSoft', text: 'warning' },
};

export function Chip({ label, selected, onPress, tone = 'neutral', size = 'medium' }: ChipProps) {
  const theme = useTheme();
  const colors = TONE_COLORS[tone];

  const content = (
    <View
      style={[
        styles.chip,
        size === 'small' && styles.chipSmall,
        {
          backgroundColor: selected ? theme.primary : theme[colors.background],
          borderColor: selected ? theme.primary : 'transparent',
        },
      ]}>
      <ThemedText
        type={size === 'small' ? 'small' : 'smallBold'}
        style={{ color: selected ? theme.onPrimary : theme[colors.text] }}>
        {label}
      </ThemedText>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      {content}
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  chipSmall: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
