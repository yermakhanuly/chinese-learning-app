import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import { RubyText } from '@/components/ruby-text';
import { ThemedText } from '@/components/themed-text';
import { SpeakButton, pickScript, useScript } from '@/components/word-parts';
import { Spacing } from '@/constants/theme';
import type { Sentence } from '@/hooks/use-dictionary';

/**
 * An example sentence with pinyin above each word (when pinyin is on). Tapping a word opens it;
 * the word being studied is highlighted.
 */
export function SentenceView({ sentence, highlight }: { sentence: Sentence; highlight?: string }) {
  const script = useScript();
  const text = pickScript(script, sentence.simplified, sentence.traditional);

  return (
    <View style={styles.sentence}>
      <View style={styles.top}>
        <RubyText
          tokens={sentence.tokens}
          highlight={highlight}
          style={styles.flex}
          onPressWord={(w) => router.push({ pathname: '/word', params: { w } })}
        />
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
  flex: { flex: 1 },
  source: { fontSize: 11, lineHeight: 14, textDecorationLine: 'underline' },
});
