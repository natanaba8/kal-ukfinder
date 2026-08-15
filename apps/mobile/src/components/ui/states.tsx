import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.centred}>
      <ActivityIndicator color={theme.primary} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card tone="flat">
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {body}
      </ThemedText>
    </Card>
  );
}

export function ErrorState({ error, onRetry }: { error: Error | null; onRetry?: () => void }) {
  return (
    <Card>
      <ThemedText type="smallBold" themeColor="accent">
        Something went wrong
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {error?.message ?? 'Unknown error'}
      </ThemedText>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  centred: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    gap: Spacing.three,
  },
});
