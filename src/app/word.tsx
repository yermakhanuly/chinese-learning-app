import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { PinyinToggle, SaveButton } from '@/components/dictionary-controls';
import { Screen } from '@/components/screen';
import { SentenceView } from '@/components/sentence-view';
import { PressableLink } from '@/components/pressable-link';
import { ThemedText } from '@/components/themed-text';
import { FrequencyMeter, Hanzi, LevelBadge, Pinyin, SpeakButton, pickScript, useScript } from '@/components/word-parts';
import { partsOfSpeech } from '@/constants/parts-of-speech';
import { Radius, Spacing } from '@/constants/theme';
import { useWord, type WordDetail } from '@/hooks/use-dictionary';
import { useTheme } from '@/hooks/use-theme';
import { useDisplayPreferences } from '@/providers/display-preferences';

export default function WordScreen() {
  // /word?w=学习 — a query parameter, so one static web page serves every dictionary entry.
  const { w: word } = useLocalSearchParams<{ w?: string }>();
  const query = useWord(word);
  const script = useScript();
  const title = query.data ? pickScript(script, query.data.simplified, query.data.traditional) : (word ?? '');

  return (
    <>
      <Stack.Screen options={{ title, headerRight: () => <PinyinToggle /> }} />
      <Screen stacked>
        {query.isPending ? (
          <ActivityIndicator style={styles.loading} />
        ) : query.isError ? (
          <Card title="Couldn't load this word">
            <ThemedText themeColor="textSecondary">Check your connection and try again.</ThemedText>
          </Card>
        ) : !query.data ? (
          <Card title="Not in the dictionary">
            <ThemedText themeColor="textSecondary">
              “{word}” isn&apos;t in the HSK lists or CC-CEDICT. Try searching for part of it.
            </ThemedText>
          </Card>
        ) : (
          <WordDetails word={query.data} />
        )}
      </Screen>
    </>
  );
}

function WordDetails({ word }: { word: WordDetail }) {
  const theme = useTheme();
  const script = useScript();
  const { showPinyin } = useDisplayPreferences();
  const shown = pickScript(script, word.simplified, word.traditional);
  const other = script === 'traditional' ? word.simplified : word.traditional;
  const pos = partsOfSpeech(word.pos);

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroText}>
          <Hanzi simplified={word.simplified} traditional={word.traditional} size={64} />
          {showPinyin ? <Pinyin text={word.pinyin} size={24} /> : null}
          {other && other !== shown ? (
            <ThemedText type="small" themeColor="textSecondary">
              {script === 'traditional' ? 'Simplified' : 'Traditional'}: <ThemedText type="small">{other}</ThemedText>
            </ThemedText>
          ) : null}
        </View>
        <SpeakButton text={word.simplified} label={`Play ${shown}`} size={52} />
      </View>

      <View style={styles.actions}>
        <LevelBadge level={word.hsk_level} />
        {word.source === 'hsk' ? <FrequencyMeter rank={word.frequency} /> : null}
        <View style={styles.spacer} />
        <SaveButton word={word.simplified} />
      </View>

      <Card title="Meaning">
        {pos.length ? (
          <ThemedText type="small" themeColor="textSecondary">
            {pos.join(' · ')}
          </ThemedText>
        ) : null}
        <View role="list" style={styles.meanings}>
          {word.meanings.map((m, i) => (
            <View key={i} role="listitem" style={styles.meaning}>
              <ThemedText themeColor="textSecondary">{i + 1}.</ThemedText>
              <ThemedText style={styles.flex}>{m}</ThemedText>
            </View>
          ))}
        </View>
        {word.classifiers.length ? (
          <View style={styles.inline}>
            <ThemedText type="small" themeColor="textSecondary">
              Measure word:
            </ThemedText>
            {word.classifiers.map((c) => (
              <WordChip key={c} word={c} />
            ))}
          </View>
        ) : null}
        {word.hsk_level == null && word.hsk_2021_level != null ? (
          <ThemedText type="small" themeColor="textSecondary">
            Not in the 2026 HSK lists; HSK {word.hsk_2021_level === 7 ? '7–9' : word.hsk_2021_level} in the 2021
            standard.
          </ThemedText>
        ) : null}
      </Card>

      {word.topics.length ? (
        <View style={styles.inline}>
          {word.topics.map((t) => (
            <PressableLink
              key={t.slug}
              href={{ pathname: '/words', params: { topic: t.slug } }}
              style={({ pressed }) => [
                styles.chip,
                {
                  borderColor: theme.border,
                  backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                },
              ]}>
              <ThemedText type="small">{t.name}</ThemedText>
            </PressableLink>
          ))}
        </View>
      ) : null}

      {word.source === 'hsk' ? (
        <Card title="Examples">
          {word.sentences.length ? (
            word.sentences.map((s, i) => (
              <View
                key={s.id}
                style={[
                  styles.example,
                  i > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth },
                ]}>
                <SentenceView sentence={s} highlight={word.simplified} />
              </View>
            ))
          ) : (
            <ThemedText themeColor="textSecondary">No example sentences for this word yet.</ThemedText>
          )}
        </Card>
      ) : null}

      {word.otherForms.length ? (
        <Card title="Other readings">
          {word.otherForms.map((f) => (
            <View key={`${f.pinyin}-${f.traditional}`} style={styles.form}>
              <Pinyin text={f.pinyin} size={17} />
              <ThemedText type="small" themeColor="textSecondary">
                {f.meanings.slice(0, 4).join('; ')}
              </ThemedText>
            </View>
          ))}
        </Card>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary" style={styles.credit}>
        Definitions: CC-CEDICT (CC BY-SA 4.0). {word.sentences.length ? 'Examples: Tatoeba (CC BY 2.0 FR). ' : ''}Audio:
        your device&apos;s voice.
      </ThemedText>
    </>
  );
}

function WordChip({ word }: { word: string }) {
  const theme = useTheme();
  return (
    <PressableLink
      href={{ pathname: '/word', params: { w: word } }}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : theme.background },
      ]}>
      <ThemedText>{word}</ThemedText>
    </PressableLink>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: Spacing.six },
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  heroText: { flex: 1, gap: Spacing.one },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flexWrap: 'wrap' },
  spacer: { flex: 1 },
  meanings: { gap: Spacing.one },
  meaning: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.large,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  example: { paddingTop: Spacing.two },
  form: { gap: Spacing.half },
  credit: { textAlign: 'center' },
});
