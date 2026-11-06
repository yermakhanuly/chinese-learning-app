import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import { RubyText } from '@/components/ruby-text';
import { ThemedText } from '@/components/themed-text';
import { SpeakButton, pickScript, useScript } from '@/components/word-parts';
import { Spacing } from '@/constants/theme';
import type { Sentence } from '@/hooks/use-dictionary';
import { useAddSentenceCard, useSentenceCards } from '@/hooks/use-review';
import { useAuth } from '@/providers/auth';

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

/** Opens pronunciation practice for a sentence (signed-in learners). */
export function SayItLink({ text, meaning }: { text: string; meaning?: string }) {
  const { session } = useAuth();
  if (!session || [...text].length > 40) return null;
  return (
    <ThemedText
      type="link"
      role="button"
      aria-label="Practise saying this sentence"
      onPress={() => router.push({ pathname: '/pronounce', params: { text, ...(meaning ? { meaning } : {}) } })}>
      🎤 Say it
    </ThemedText>
  );
}

/** "Add to review" for an example sentence (signed-in learners); shows when it's already added. */
export function AddSentenceToReview({ sentenceId }: { sentenceId: number }) {
  const { session } = useAuth();
  const added = useSentenceCards();
  const add = useAddSentenceCard();
  if (!session || !added.data) return null;
  if (added.data.has(sentenceId)) {
    return (
      <ThemedText type="small" themeColor="success">
        ✓ In your review
      </ThemedText>
    );
  }
  return (
    <ThemedText
      type="link"
      role="button"
      aria-label="Add sentence to review"
      aria-disabled={add.isPending}
      onPress={() => !add.isPending && add.mutate(sentenceId)}>
      {add.isPending ? 'Adding…' : add.isError ? "Couldn't add. Try again" : '+ Add to review'}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  sentence: { gap: Spacing.one },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  flex: { flex: 1 },
  source: { fontSize: 11, lineHeight: 14, textDecorationLine: 'underline' },
});
