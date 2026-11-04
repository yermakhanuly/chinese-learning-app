import type { ColorScheme } from '@/constants/theme';
import { useThemePreference } from '@/providers/theme-preference';

/** The color scheme in effect: the user's choice, or the system setting when they chose "system". */
export function useColorScheme(): ColorScheme {
  return useThemePreference().scheme;
}
