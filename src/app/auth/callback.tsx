import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyAuthError, parseAuthRedirect } from '@/lib/auth-helpers';
import { useAuth } from '@/providers/auth';

/** Web: an error Google/Supabase put in this page's URL. */
function webUrlError(): string | null {
  if (process.env.EXPO_OS !== 'web' || typeof window === 'undefined') return null;
  const parsed = parseAuthRedirect(window.location.href);
  return parsed.kind === 'error' ? friendlyAuthError(parsed.message) : null;
}

/**
 * Landing page after Google login. The session itself is created elsewhere (supabase-js on web,
 * src/lib/auth-links.native.ts on iPhone); this page waits for it and goes Home.
 */
export default function AuthCallbackScreen() {
  const theme = useTheme();
  const { session, initialized, linkError } = useAuth();
  const error = linkError ?? webUrlError();

  useEffect(() => {
    if (initialized && session) router.replace('/');
  }, [initialized, session]);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {error ? (
        <>
          <ThemedText themeColor="danger" role="alert">
            Login failed: {error}
          </ThemedText>
          <Button label="Back to login" onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <>
          <ActivityIndicator color={theme.tint} />
          <ThemedText themeColor="textSecondary">Signing you in…</ThemedText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
});
