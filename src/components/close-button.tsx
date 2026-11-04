import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Closes a modal screen; falls back to Home when the page was opened directly (web). */
export function closeModal() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function CloseButton({ label = 'Close' }: { label?: string }) {
  const theme = useTheme();
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={closeModal}
      hitSlop={12}
      style={({ pressed }) => [styles.button, { backgroundColor: theme.backgroundElement }, pressed && styles.pressed]}>
      <SymbolView name={{ ios: 'xmark', web: 'close' }} size={18} tintColor={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-end',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -Spacing.three,
  },
  pressed: { opacity: 0.7 },
});
