import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = true,
}: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || loading;

  const background =
    variant === 'primary' ? theme.primary : variant === 'secondary' ? theme.backgroundElement : 'transparent';
  const textColor = variant === 'primary' ? theme.onPrimary : theme.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={inactive ? () => undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        fullWidth && styles.fullWidth,
        {
          backgroundColor: background,
          borderColor: variant === 'ghost' ? theme.border : 'transparent',
          opacity: inactive ? 0.55 : pressed ? 0.85 : 1,
        },
      ]}>
      <View style={styles.content}>
        {loading ? <ActivityIndicator size="small" color={textColor} /> : null}
        <ThemedText type="smallBold" style={{ color: textColor }}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
    borderRadius: Radius.medium,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
