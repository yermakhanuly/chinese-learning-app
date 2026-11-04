import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import type { ColorScheme } from '@/constants/theme';
import { getItem, setItem } from '@/lib/storage';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme-preference';

type ThemePreferenceValue = {
  preference: ThemePreference;
  scheme: ColorScheme;
  setPreference: (p: ThemePreference) => void;
};

const ThemePreferenceContext = createContext<ThemePreferenceValue | null>(null);

// Tiny external store over device storage, so every reader stays in sync.
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function readStored(): ThemePreference {
  const v = getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}
function writeStored(p: ThemePreference) {
  setItem(STORAGE_KEY, p);
  listeners.forEach((l) => l());
}

const noopSubscribe = () => () => {};

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const system = useSystemColorScheme();
  // Web static HTML is rendered without storage or media queries: the server snapshot ("system", not
  // hydrated → light) is used during hydration, then React re-renders with the real values.
  const preference = useSyncExternalStore(subscribe, readStored, () => 'system' as const);
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const setPreference = useCallback((p: ThemePreference) => writeStored(p), []);

  const scheme: ColorScheme =
    preference === 'system' ? (hydrated && system === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo(() => ({ preference, scheme, setPreference }), [preference, scheme, setPreference]);
  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
}

export function useThemePreference(): ThemePreferenceValue {
  const ctx = useContext(ThemePreferenceContext);
  if (!ctx) throw new Error('useThemePreference must be used inside ThemePreferenceProvider');
  return ctx;
}
