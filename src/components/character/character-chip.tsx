import { StyleSheet } from 'react-native';

import { PressableLink } from '@/components/pressable-link';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A character as a small tappable tile that opens its character page. */
export function CharacterChip({ character, size = 26, detail }: { character: string; size?: number; detail?: string }) {
  const theme = useTheme();
  return (
    <PressableLink
      href={{ pathname: '/character', params: { c: character } }}
      aria-label={`Character ${character}${detail ? `, ${detail}` : ''}`}
      style={({ pressed }) => [
        styles.chip,
        { minWidth: size * 1.8, borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
      ]}>
      <ThemedText lang="zh" style={{ fontSize: size, lineHeight: Math.round(size * 1.3) }}>
        {character}
      </ThemedText>
      {detail ? (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {detail}
        </ThemedText>
      ) : null}
    </PressableLink>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
