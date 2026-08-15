import { type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = {
  children: ReactNode;
  /** Adds a pull-to-refresh control when supplied. */
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  /** Set when the screen sits inside a tab bar and needs bottom clearance. */
  padBottom?: boolean;
};

/**
 * Page shell: safe-area aware, centred and width-capped so the web build does
 * not stretch a single column across a 27-inch monitor.
 */
export function Screen({
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
  contentStyle,
  padBottom = true,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const inner = (
    <View style={[styles.inner, { paddingBottom: padBottom ? Spacing.seven : 0 }, contentStyle]}>
      {children}
    </View>
  );

  if (!scroll) {
    return (
      <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top }]}>{inner}</View>
    );
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + Spacing.two }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        ) : undefined
      }>
      {inner}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
});
