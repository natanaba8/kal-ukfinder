import { StyleSheet, Switch, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type FieldProps = TextInputProps & {
  label?: string;
  hint?: string;
  /** Renders a taller multi-line input for CVs and answers. */
  area?: boolean;
};

export function TextField({ label, hint, area = false, style, ...rest }: FieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      {label ? <ThemedText type="smallBold">{label}</ThemedText> : null}
      <TextInput
        placeholderTextColor={theme.textMuted}
        multiline={area}
        textAlignVertical={area ? 'top' : 'center'}
        style={[
          styles.input,
          area && styles.area,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text },
          style,
        ]}
        {...rest}
      />
      {hint ? (
        <ThemedText type="small" themeColor="textMuted">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.switchRow}>
      <View style={styles.switchText}>
        <ThemedText type="default">{label}</ThemedText>
        {description ? (
          <ThemedText type="small" themeColor="textSecondary">
            {description}
          </ThemedText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: theme.primary, false: theme.backgroundSelected }}
        thumbColor={theme.card}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
  input: {
    borderRadius: Radius.medium,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    minHeight: 46,
  },
  area: {
    minHeight: 160,
    paddingTop: Spacing.three,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.four,
  },
  switchText: {
    flex: 1,
    gap: Spacing.half,
  },
});
