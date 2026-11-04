import { focusManager } from '@tanstack/react-query';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';

let registered = false;

/**
 * iPhone: refresh the login token only while the app is open, and refetch data (e.g. a profile
 * changed on the website) whenever the app comes back to the foreground.
 */
export function registerAppStateListeners(): void {
  if (registered) return;
  registered = true;

  if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });

  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
    return () => sub.remove();
  });
}
