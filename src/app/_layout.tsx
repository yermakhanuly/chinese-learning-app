import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Celebrations } from '@/components/progress/celebrations';
import { useProfile } from '@/hooks/use-profile';
import { AuthProvider, useAuth } from '@/providers/auth';
import { ThemePreferenceProvider } from '@/providers/theme-preference';

SplashScreen.preventAutoHideAsync();

const WITH_HEADER = { headerShown: true, headerBackTitle: 'Back', headerShadowVisible: false } as const;

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 2 } } }));
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemePreferenceProvider>
          <ThemedRoot />
        </ThemePreferenceProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function ThemedRoot() {
  const scheme = useColorScheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];
  const { session, initialized } = useAuth();
  const profile = useProfile();

  // Hide the splash once we know who is signed in (and, if someone is, whether they finished onboarding).
  const ready = initialized && (!session || !profile.isPending);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  const needsOnboarding = !!session && !!profile.data && !profile.data.onboarded_at;

  return (
    <ThemeProvider
      value={{
        ...base,
        colors: { ...base.colors, primary: c.tint, background: c.background, card: c.background, text: c.text, border: c.border },
      }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!needsOnboarding}>
          <Stack.Screen name="(tabs)" />
          {/* Dictionary pages pushed over the tabs, with a native header (back button, title). */}
          <Stack.Screen name="word" options={WITH_HEADER} />
          <Stack.Screen name="words" options={WITH_HEADER} />
          <Stack.Screen name="saved" options={WITH_HEADER} />
          <Stack.Screen name="mistakes" options={WITH_HEADER} />
          <Stack.Screen name="my-cards" options={WITH_HEADER} />
          {/* Pages with a writing pad: a left-to-right stroke must not swipe back (use the Back button). */}
          <Stack.Screen name="character" options={{ ...WITH_HEADER, gestureEnabled: false }} />
          <Stack.Screen name="characters" options={WITH_HEADER} />
          <Stack.Screen name="listening" options={WITH_HEADER} />
          <Stack.Screen name="tones" options={WITH_HEADER} />
          <Stack.Screen name="grammar" options={WITH_HEADER} />
          <Stack.Screen name="grammar-point" options={WITH_HEADER} />
          <Stack.Screen name="reading" options={WITH_HEADER} />
          <Stack.Screen name="reading-text" options={WITH_HEADER} />
          <Stack.Screen name="progress" options={WITH_HEADER} />
          <Stack.Screen name="leaderboard" options={WITH_HEADER} />
          <Stack.Screen name="tutor" options={WITH_HEADER} />
          <Stack.Screen name="conversation" options={WITH_HEADER} />
          <Stack.Screen name="ai-tools" options={WITH_HEADER} />
          {/* Lessons and review sessions take the whole screen; the placement test is a sheet. */}
          <Stack.Screen name="lesson" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="review-session" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="grammar-practice" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="grammar-note" options={{ presentation: 'modal' }} />
          <Stack.Screen name="mock-test" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
          <Stack.Screen name="placement" options={{ presentation: 'modal' }} />
          <Stack.Screen name="character-quiz" options={{ presentation: 'modal', gestureEnabled: false }} />
          <Stack.Screen name="tone-quiz" options={{ presentation: 'modal' }} />
          <Stack.Screen name="listening-quiz" options={{ presentation: 'modal' }} />
          <Stack.Screen name="pronounce" options={{ presentation: 'modal' }} />
          <Stack.Screen name="ai-quiz" options={{ presentation: 'modal' }} />
          <Stack.Screen name="premium" options={{ presentation: 'modal' }} />
          <Stack.Screen name="sign-in" options={{ presentation: 'modal' }} />
          <Stack.Screen name="sign-up" options={{ presentation: 'modal' }} />
          <Stack.Screen name="forgot-password" options={{ presentation: 'modal' }} />
          <Stack.Screen name="tutorial" options={{ presentation: 'modal' }} />
        </Stack.Protected>
        <Stack.Protected guard={needsOnboarding}>
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" options={{ presentation: 'card' }} />
      </Stack>
      {session && profile.data?.onboarded_at ? <Celebrations /> : null}
    </ThemeProvider>
  );
}
