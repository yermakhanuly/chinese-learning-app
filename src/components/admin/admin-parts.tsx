import { Stack } from 'expo-router';
import { type ReactNode } from 'react';
import { ActivityIndicator, Platform, StyleSheet, TextInput, View } from 'react-native';

import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useIsAdmin } from '@/hooks/use-admin';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth';

/**
 * An admin dashboard page: web only, admins only. Everyone else sees "not found" (the database
 * refuses them anyway; this just keeps the pages out of sight).
 */
export function AdminPage({ title, children }: { title: string; children: ReactNode }) {
  const { session } = useAuth();
  const { admin, loading } = useIsAdmin();
  const web = Platform.OS === 'web';
  return (
    <>
      <Stack.Screen options={{ title }} />
      <Screen stacked>
        {!web ? (
          <Card title="The admin dashboard is on the web">
            <ThemedText themeColor="textSecondary">Open the app in a browser to manage content.</ThemedText>
          </Card>
        ) : session && loading ? (
          <ActivityIndicator />
        ) : !session || !admin ? (
          <Card title="Page not found">
            <ThemedText themeColor="textSecondary">This page doesn&apos;t exist.</ThemedText>
          </Card>
        ) : (
          <View style={styles.wide}>{children}</View>
        )}
      </Screen>
    </>
  );
}

/** A plain multi-line code field (JSON), monospaced. */
export function CodeField({
  label,
  value,
  onChangeText,
  error,
  minHeight = 360,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string | null;
  minHeight?: number;
}) {
  const theme = useTheme();
  return (
    <View style={styles.gapSmall}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        aria-label={label}
        aria-invalid={!!error}
        value={value}
        onChangeText={onChangeText}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        style={[
          styles.code,
          { minHeight, color: theme.text, backgroundColor: theme.background, borderColor: error ? theme.danger : theme.border },
        ]}
      />
      {error ? (
        <ThemedText type="small" themeColor="danger" role="alert">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function Badge({ label, tone = 'textSecondary' }: { label: string; tone?: 'tint' | 'warning' | 'success' | 'danger' | 'textSecondary' }) {
  const theme = useTheme();
  return (
    <View style={[styles.badge, { borderColor: theme[tone] }]}>
      <ThemedText type="small" themeColor={tone}>
        {label}
      </ThemedText>
    </View>
  );
}

export function Problems({ problems }: { problems: string[] }) {
  if (!problems.length) {
    return (
      <ThemedText themeColor="success" role="status">
        ✓ No problems found.
      </ThemedText>
    );
  }
  return (
    <View role="list" aria-label="Problems" style={styles.gapSmall}>
      <ThemedText type="smallBold" themeColor="warning">
        {problems.length} {problems.length === 1 ? 'problem' : 'problems'}
      </ThemedText>
      {problems.map((p, i) => (
        <ThemedText key={i} role="listitem" type="small">
          • {p}
        </ThemedText>
      ))}
    </View>
  );
}

export const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const styles = StyleSheet.create({
  wide: { gap: Spacing.three },
  gapSmall: { gap: Spacing.one },
  code: {
    borderWidth: 1,
    borderRadius: Radius.small,
    padding: Spacing.two,
    fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'Menlo' }),
    fontSize: 13,
    lineHeight: 19,
    textAlignVertical: 'top',
  },
  badge: { borderWidth: 1, borderRadius: Radius.small, paddingHorizontal: Spacing.two, paddingVertical: 1, alignSelf: 'flex-start' },
});
