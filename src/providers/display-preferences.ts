import { useCallback, useSyncExternalStore } from 'react';

import { getItem, setItem } from '@/lib/storage';

/**
 * Per-device reading preferences: pinyin on/off, Hanzi size and tone colors.
 * Stored like the theme preference (device storage + a tiny external store), so every screen
 * that reads them updates together.
 */
export type HanziSize = 'small' | 'medium' | 'large' | 'xlarge';

export const HANZI_SIZES: { value: HanziSize; label: string }[] = [
  { value: 'small', label: 'S' },
  { value: 'medium', label: 'M' },
  { value: 'large', label: 'L' },
  { value: 'xlarge', label: 'XL' },
];

/** Multiplier applied to every Hanzi font size. */
export const HANZI_SCALE: Record<HanziSize, number> = { small: 0.85, medium: 1, large: 1.25, xlarge: 1.5 };

type Prefs = { showPinyin: boolean; hanziSize: HanziSize; toneColors: boolean };

const KEY = 'display-preferences';
const DEFAULTS: Prefs = { showPinyin: true, hanziSize: 'medium', toneColors: true };

const listeners = new Set<() => void>();
let cached: Prefs | null = null;

function read(): Prefs {
  if (cached) return cached;
  try {
    const parsed = JSON.parse(getItem(KEY) ?? '{}') as Partial<Prefs>;
    cached = {
      showPinyin: typeof parsed.showPinyin === 'boolean' ? parsed.showPinyin : DEFAULTS.showPinyin,
      hanziSize: parsed.hanziSize && parsed.hanziSize in HANZI_SCALE ? parsed.hanziSize : DEFAULTS.hanziSize,
      toneColors: typeof parsed.toneColors === 'boolean' ? parsed.toneColors : DEFAULTS.toneColors,
    };
  } catch {
    cached = DEFAULTS;
  }
  return cached;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDisplayPreferences() {
  // The web's static HTML has no storage: render defaults first, then the stored values.
  const prefs = useSyncExternalStore(subscribe, read, () => DEFAULTS);
  const update = useCallback((changes: Partial<Prefs>) => {
    cached = { ...read(), ...changes };
    setItem(KEY, JSON.stringify(cached));
    listeners.forEach((l) => l());
  }, []);
  return { ...prefs, hanziScale: HANZI_SCALE[prefs.hanziSize], update };
}
