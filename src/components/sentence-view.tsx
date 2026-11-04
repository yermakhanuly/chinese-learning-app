import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { SpeakButton, pickScript, useScript } from '@/components/word-parts';
import { Spacing } from '@/constants/theme';
import type { Sentence } from '@/hooks/use-dictionary';
import { useTheme } from '@/hooks/use-theme';
import { useDisplayPreferences } from '@/providers/display-preferences';

/**
 * An example sentence with pinyin above each word (when pinyin is on). Tapping a word opens it;
 * the word being studied is highlighted.
 */
export function SentenceView({ sentence, highlight }: { sentence: Sentence; highlight?: string }) {
  const theme = useTheme();
  const script = useScript();
  const { showPinyin, hanziScale } = useDisplayPreferences();
  const hanziSize = Math.round(20 * hanziScale);
  const text = pickScript(script, sentence.simplified, sentence.traditional);

  return (
    <View style={styles.sentence}>
      <View style={styles.top}>
        <View style={styles.tokens}>
          {sentence.tokens.map((t, i) => {
            const isWord = !!t.p;
            const isTarget = t.s === highlight;
            const chars = pickScript(script, t.s, t.t);
            const inner = (
              <View style={styles.token}>
                {showPinyin ? <Text style={[styles.pinyin, { color: theme.textSecondary }]}>{t.p ?? ' '}</Text> : null}
                <Text
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
            return isWord && !isTarget ? (
              <Pressable
                key={i}
                role="link"
                aria-label={`${chars}, ${t.p}`}
                onPress={() => router.push({ pathname: '/word', params: { w: t.s } })}
                style={({ pressed }) => pressed && { opacity: 0.6 }}>
                {inner}
              </Pressable>
            ) : (
              <View key={i}>{inner}</View>
            );
          })}
        </View>
        <SpeakButton text={sentence.simplified} label={`Play sentence: ${text}`} size={36} />
      </View>
      <ThemedText themeColor="textSecondary">{sentence.english}</ThemedText>
      <ExternalLink href={`https://tatoeba.org/en/sentences/show/${sentence.id}`}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.source}>
          Tatoeba #{sentence.id}
        </ThemedText>
      </ExternalLink>
    </View>
  );
}

const styles = StyleSheet.create({
  sentence: { gap: Spacing.one },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  tokens: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  token: { alignItems: 'center', paddingHorizontal: 1 },
  pinyin: { fontSize: 12, lineHeight: 16 },
  source: { fontSize: 11, lineHeight: 14, textDecorationLine: 'underline' },
});
