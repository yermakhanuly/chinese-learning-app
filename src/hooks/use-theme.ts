import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Color tokens for the active scheme. */
export function useTheme() {
  return Colors[useColorScheme()];
}
