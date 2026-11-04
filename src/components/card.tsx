import { type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  title?: string;
  children: ReactNode;
  style?: ViewStyle;
};

export function Card({ title, children, style }: Props) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        style,
      ]}>
      {title ? <ThemedText type="heading">{title}</ThemedText> : null}
      {children}
    </View>
  );
}

/** Lists features that arrive in a later phase, so empty tabs explain themselves. */
export function ComingSoon({ phase, items }: { phase: number; items: string[] }) {
  const theme = useTheme();
  return (
    <Card title={`Coming in Phase ${phase}`}>
      {items.map((item) => (
        <View key={item} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: theme.tint }]} />
          <ThemedText themeColor="textSecondary" style={styles.rowText}>
            {item}
          </ThemedText>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 6, height: 6, borderRadius: 3 },
  rowText: { flex: 1 },
});
