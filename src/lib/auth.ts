import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { parseAuthRedirect } from '@/lib/auth-helpers';
import { supabase, supabaseKey, supabaseUrl } from '@/lib/supabase';

/** True when the Google provider is switched on in Supabase (see supabase/config.toml). */
export async function fetchGoogleEnabled(): Promise<boolean> {
  const res = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabaseKey } });
  if (!res.ok) return false;
  const settings = (await res.json()) as { external?: Record<string, boolean> };
  return settings.external?.google === true;
}

/**
 * Web: full-page redirect to Google; Supabase reads the result on /auth/callback.
 * iPhone: in-app browser sheet, then the tokens in the redirect URL become the session.
 * Returns false if the learner closed the sheet.
 */
export async function signInWithGoogle(): Promise<boolean> {
  if (process.env.EXPO_OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
    return true;
  }

  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;
  await completeAuthRedirect(result.url);
  return true;
}

/** Turns an OAuth redirect URL into a session. No-op for URLs without auth data. */
export async function completeAuthRedirect(url: string): Promise<void> {
  const parsed = parseAuthRedirect(url);
  if (parsed.kind === 'error') throw new Error(parsed.message);
  if (parsed.kind === 'none') return;
  const { error } = await supabase.auth.setSession({
    access_token: parsed.accessToken,
    refresh_token: parsed.refreshToken,
  });
  if (error) throw error;
}
