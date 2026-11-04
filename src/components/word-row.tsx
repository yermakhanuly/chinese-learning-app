import { StyleSheet, View } from 'react-native';

import { PressableLink } from '@/components/pressable-link';
import { ThemedText } from '@/components/themed-text';
import { Hanzi, LevelBadge, Pinyin, pickScript, useScript } from '@/components/word-parts';
import { Radius, Spacing } from '@/constants/theme';
import type { WordSummary } from '@/hooks/use-dictionary';
import { useTheme } from '@/hooks/use-theme';
import { useDisplayPreferences } from '@/providers/display-preferences';

/** One word in a search result or list; opens the word page. */
export function WordRow({ word }: { word: WordSummary }) {
  const theme = useTheme();
  const script = useScript();
  const { showPinyin } = useDisplayPreferences();
  const meaning = word.meanings.slice(0, 2).join('; ');
  return (
    <PressableLink
      href={{ pathname: '/word', params: { w: word.simplified } }}
      aria-label={`${pickScript(script, word.simplified, word.traditional)}, ${word.pinyin}: ${meaning}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
      <View style={styles.hanzi}>
        <Hanzi simplified={word.simplified} traditional={word.traditional} size={26} />
      </View>
      <View style={styles.text}>
        {showPinyin ? <Pinyin text={word.pinyin} size={15} /> : null}
        <ThemedText type="small" numberOfLines={2}>
          {meaning}
        </ThemedText>
      </View>
      {word.hsk_level != null ? <LevelBadge level={word.hsk_level} /> : null}
    </PressableLink>
  );
}

export function WordList({ words }: { words: WordSummary[] }) {
  return (
    <View style={styles.list} role="list">
      {words.map((w) => (
        <View key={`${w.source}-${w.simplified}-${w.pinyin}`} role="listitem">
          <WordRow word={w} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hanzi: { minWidth: 56 },
  text: { flex: 1, gap: Spacing.half },
});
