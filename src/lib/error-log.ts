import Constants from 'expo-constants';

import { supabase } from '@/lib/supabase';

/**
 * Our own error monitoring: unexpected errors go to the `client_errors` table (admin dashboard →
 * Errors) through log_client_error, which rate-limits. No third-party service, no personal data
 * beyond the learner id the database already knows.
 */
const recent = new Map<string, number>();

export function logError(error: unknown, context: Record<string, string | number | boolean | null> = {}) {
  const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : safeString(error));
  const message = e.message || '(no message)';
  // The same error repeating (a render loop, a retrying request) is sent once a minute.
  const last = recent.get(message);
  if (last && Date.now() - last < 60_000) return;
  recent.set(message, Date.now());
  if (__DEV__) console.warn('[error log]', message);
  void supabase
    .rpc('log_client_error', {
      p_message: message.slice(0, 1000),
      p_stack: e.stack?.slice(0, 4000) ?? null,
      p_context: { platform: process.env.EXPO_OS ?? 'unknown', version: Constants.expoConfig?.version ?? '?', ...context },
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

function safeString(v: unknown) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

let installed = false;

/** Catches errors nothing else handled: uncaught exceptions and rejected promises. */
export function installGlobalErrorHandlers() {
  if (installed) return;
  installed = true;
  if (process.env.EXPO_OS === 'web') {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (event) => logError(event.error ?? event.message, { kind: 'uncaught' }));
    window.addEventListener('unhandledrejection', (event) => logError(event.reason, { kind: 'unhandled promise' }));
    return;
  }
  const g = globalThis as unknown as {
    ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void };
  };
  const previous = g.ErrorUtils?.getGlobalHandler();
  g.ErrorUtils?.setGlobalHandler((e, fatal) => {
    logError(e, { kind: fatal ? 'fatal' : 'uncaught' });
    previous?.(e, fatal);
  });
}
