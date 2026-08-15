import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Card({
  children,
  onPress,
  style,
  tone = 'default',
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  tone?: 'default' | 'flat';
}) {
  const theme = useTheme();

  const body = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tone === 'flat' ? theme.backgroundElement : theme.card,
          borderColor: theme.border,
        },
        style,
      ]}>
      {children}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      {body}
    </Pressable>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionText}>
        <ThemedText type="smallBold" style={styles.sectionTitle}>
          {title.toUpperCase()}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  pressed: {
    opacity: 0.75,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  sectionText: {
    flex: 1,
    gap: Spacing.half,
  },
  sectionTitle: {
    letterSpacing: 0.8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
});
