import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

import { resolveSupabaseUrl } from '@/lib/dev-host';
import { getItem, removeItem, setItem } from '@/lib/storage';

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!rawUrl || !key) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY. Copy .env.example to .env.local.');
}

const isWeb = process.env.EXPO_OS === 'web';

export const supabaseUrl = resolveSupabaseUrl(rawUrl, process.env.EXPO_OS, Constants.expoConfig?.hostUri);
export const supabaseKey = key;

/**
 * The login session lives in device storage (browser localStorage / expo-sqlite on iPhone).
 * Web reads OAuth results from the URL itself; iPhone handles them in src/lib/auth.ts.
 */
export const supabase = createClient(supabaseUrl, key, {
  auth: {
    storage: { getItem, setItem, removeItem },
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: isWeb,
  },
});
