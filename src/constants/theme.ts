/**
 * Design tokens shared by iPhone and web. Every screen styles itself from these values
 * (via `useTheme()`), so light/dark mode and later re-theming happen in one place.
 */
import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#16161A',
    textSecondary: '#5B5E66',
    background: '#FFFFFF',
    backgroundElement: '#F3F2EF',
    backgroundSelected: '#E7E4DE',
    border: '#DEDAD2',
    /** Brand accent (Chinese red). 6.0:1 contrast on white. */
    tint: '#B8202E',
    onTint: '#FFFFFF',
    success: '#1E7A46',
    warning: '#A15C07',
    danger: '#B42318',
    /** Tone colors for pinyin/hanzi (1–4, 5 = neutral). */
    tone1: '#C62828',
    tone2: '#D46B08',
    tone3: '#2E7D32',
    tone4: '#1565C0',
    tone5: '#6B6F76',
  },
  dark: {
    text: '#F4F3F0',
    textSecondary: '#A9ACB3',
    background: '#0E0E11',
    backgroundElement: '#1B1B20',
    backgroundSelected: '#2A2A31',
    border: '#33333B',
    tint: '#FF6B6B',
    onTint: '#16161A',
    success: '#4ADE80',
    warning: '#FBBF24',
    danger: '#F87171',
    tone1: '#FF6B6B',
    tone2: '#FFA94D',
    tone3: '#69DB7C',
    tone4: '#74C0FC',
    tone5: '#A9ACB3',
  },
} as const;

export type ColorScheme = keyof typeof Colors;
export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 8,
  medium: 14,
  large: 22,
} as const;

/** Width at which the web layout switches from a bottom tab bar to a side bar. */
export const WideBreakpoint = 768;
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
