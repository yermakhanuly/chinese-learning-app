import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  /** Page title; leave out when a native header (or the content itself) names the page. */
  title?: string;
  subtitle?: string;
  /** Shown above the title, e.g. a close button on sign-in screens. */
  topAction?: ReactNode;
  /** Shown as an iPhone sheet, which already sits below the status bar. */
  modal?: boolean;
  /** Pushed page under a native header (no tab bar): the header already clears the status bar. */
  stacked?: boolean;
  children: ReactNode;
};

/** Standard scrolling page: safe-area aware, centered, max content width on large screens. */
export function Screen({ title, subtitle, topAction, modal, stacked, children }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isWeb = process.env.EXPO_OS === 'web';

  return (
    <ScrollView
      // Insets are applied manually below; stop iOS from adding them a second time.
      contentInsetAdjustmentBehavior={stacked ? 'automatic' : 'never'}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: stacked ? Spacing.three : (modal && process.env.EXPO_OS === 'ios' ? 0 : insets.top) + Spacing.four,
          // Web tab bar sits in the layout flow; the iPhone tab bar floats over content.
          // Stacked pages: iOS adds the home-indicator inset itself ('automatic' above).
          paddingBottom: stacked
            ? Spacing.five
            : insets.bottom + (isWeb ? Spacing.five : BottomTabInset + Spacing.four),
        },
      ]}>
      <View style={styles.inner}>
        {topAction}
        {title ? (
          <View style={styles.header}>
            <ThemedText type="title">{title}</ThemedText>
            {subtitle ? <ThemedText themeColor="textSecondary">{subtitle}</ThemedText> : null}
          </View>
        ) : null}
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
