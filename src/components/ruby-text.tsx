import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { pickScript, useScript } from '@/components/word-parts';
import type { Token } from '@/lib/sentences';
import { useTheme } from '@/hooks/use-theme';
import { useDisplayPreferences } from '@/providers/display-preferences';

/**
 * Chinese text as words with pinyin above each one (when pinyin is on), in the learner's script
 * and Hanzi size. `highlight` marks a word; `onPressWord` makes words tappable.
 */
export function RubyText({
  tokens,
  size = 20,
  highlight,
  onPressWord,
  style,
}: {
  tokens: Token[];
  /** Base Hanzi size before the learner's size setting. */
  size?: number;
  highlight?: string;
  onPressWord?: (simplified: string) => void;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const script = useScript();
  const { showPinyin, hanziScale } = useDisplayPreferences();
  const hanziSize = Math.round(size * hanziScale);
  const pinyinSize = Math.max(11, Math.round(hanziSize * 0.6));

  return (
    <View style={[styles.tokens, style]} aria-label={tokens.map((t) => pickScript(script, t.s, t.t)).join('')}>
      {tokens.map((t, i) => {
        const isTarget = !!highlight && t.s === highlight;
        const chars = pickScript(script, t.s, t.t);
        const inner = (
          <View style={styles.token}>
            {showPinyin ? (
              <Text style={{ fontSize: pinyinSize, lineHeight: Math.round(pinyinSize * 1.3), color: theme.textSecondary }}>
                {t.p ?? ' '}
              </Text>
            ) : null}
            <Text
              lang="zh"
              style={{
                fontSize: hanziSize,
                lineHeight: Math.round(hanziSize * 1.3),
                color: isTarget ? theme.tint : theme.text,
                fontWeight: isTarget ? 700 : 400,
              }}>
              {chars}
            </Text>
          </View>
        );
        return onPressWord && t.p && !isTarget ? (
          <Pressable
            key={i}
            role="link"
            aria-label={`${chars}, ${t.p}`}
            onPress={() => onPressWord(t.s)}
            style={({ pressed }) => pressed && { opacity: 0.6 }}>
            {inner}
          </Pressable>
        ) : (
          <View key={i}>{inner}</View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tokens: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  token: { alignItems: 'center', paddingHorizontal: 1 },
});
