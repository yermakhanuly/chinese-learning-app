import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, variant = 'primary', loading, disabled, style }: Props) {
  const theme = useTheme();
  const inactive = disabled || loading;
  const colors = {
    primary: { bg: theme.tint, fg: theme.onTint, border: theme.tint },
    secondary: { bg: theme.backgroundElement, fg: theme.text, border: theme.border },
    ghost: { bg: 'transparent', fg: theme.tint, border: 'transparent' },
    danger: { bg: 'transparent', fg: theme.danger, border: theme.danger },
  }[variant];

  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={inactive}
      aria-busy={loading}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.bg, borderColor: colors.border },
        inactive && styles.inactive,
        pressed && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={colors.fg} />
      ) : (
        <ThemedText type="label" numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.fg, textAlign: 'center' }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: Radius.small + 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
});
