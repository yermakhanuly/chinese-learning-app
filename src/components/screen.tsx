import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  title: string;
  subtitle?: string;
  /** Shown above the title, e.g. a close button on sign-in screens. */
  topAction?: ReactNode;
  /** Shown as an iPhone sheet, which already sits below the status bar. */
  modal?: boolean;
  children: ReactNode;
};

/** Standard scrolling page: safe-area aware, centered, max content width on large screens. */
export function Screen({ title, subtitle, topAction, modal, children }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isWeb = process.env.EXPO_OS === 'web';

  return (
    <ScrollView
      // Insets are applied manually below; stop iOS from adding them a second time.
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: (modal && process.env.EXPO_OS === 'ios' ? 0 : insets.top) + Spacing.four,
          // Web tab bar sits in the layout flow; the iPhone tab bar floats over content.
          paddingBottom: insets.bottom + (isWeb ? Spacing.five : BottomTabInset + Spacing.four),
        },
      ]}>
      <View style={styles.inner}>
        {topAction}
        <View style={styles.header}>
          <ThemedText type="title">{title}</ThemedText>
          {subtitle ? <ThemedText themeColor="textSecondary">{subtitle}</ThemedText> : null}
        </View>
        {children}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.three, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.four },
  header: { gap: Spacing.one },
});
