import { useId } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string | null;
  hint?: string;
};

export function TextField({ label, error, hint, ...input }: Props) {
  const theme = useTheme();
  const id = useId();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" nativeID={`${id}-label`}>
        {label}
      </ThemedText>
      <TextInput
        aria-label={label}
        aria-labelledby={`${id}-label`}
        aria-invalid={!!error}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.background,
            borderColor: error ? theme.danger : theme.border,
          },
        ]}
        {...input}
      />
      {error ? (
        <ThemedText type="small" themeColor="danger" role="alert">
          {error}
        </ThemedText>
      ) : hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.one + 2 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Radius.small + 2,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
});
