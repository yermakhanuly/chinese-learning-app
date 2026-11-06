import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { PinyinToggle, SaveButton } from '@/components/dictionary-controls';
import { PressableLink } from '@/components/pressable-link';
import { RubyText } from '@/components/ruby-text';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Pinyin } from '@/components/word-parts';
import { Radius, Spacing } from '@/constants/theme';
import { useCompleteReading, useGrammarTitles, useReadingText, type ReadingRow, type WordInfo } from '@/hooks/use-grammar';
import { useHydrated } from '@/hooks/use-hydrated';
import { useTheme } from '@/hooks/use-theme';
import { readingScore } from '@/lib/grammar';
import { speakChinese, stopSpeech, useSpeech } from '@/lib/speech';
import { useAuth } from '@/providers/auth';

/** /reading-text?id=r1-01 — read a graded text with audio, tap-to-translate and questions. */
export default function ReadingTextScreen() {
  const hydrated = useHydrated();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const text = useReadingText(hydrated ? id : undefined);
  // Leaving the page stops the read-along.
  useEffect(() => () => void stopSpeech(), []);
  return (
    <>
      <Stack.Screen options={{ title: 'Reading', headerRight: () => <PinyinToggle /> }} />
      <Screen stacked>
        {!hydrated || text.isPending ? (
          <ActivityIndicator />
        ) : !text.data ? (
          <ThemedText themeColor={text.isError ? 'danger' : 'textSecondary'}>
            {text.isError ? "Couldn't load this text. Check your connection." : 'Text not found.'}
          </ThemedText>
        ) : (
          <Reader key={text.data.id} text={text.data} />
        )}
      </Screen>
    </>
  );
}

const sentenceId = (text: ReadingRow, i: number) => `read-${text.id}-${i}`;

function Reader({ text }: { text: ReadingRow }) {
  const theme = useTheme();
  const { playingId } = useSpeech();
  const [translate, setTranslate] = useState(false);
  // The tapped word and the sentence it's in (the panel opens under that sentence).
  const [tapped, setTapped] = useState<{ word: string; sentence: number } | null>(null);
  const titles = useGrammarTitles();
  const prefix = `read-${text.id}-`;
  const current = playingId?.startsWith(prefix) ? Number(playingId.slice(prefix.length)) : null;

  // Reads sentence i, then the next ones, until the end or until stopped.
  const playFrom = (i: number) => {
    const s = text.sentences[i];
    if (!s) return;
    void speakChinese(s.zh, sentenceId(text, i), s.zh, () => playFrom(i + 1));
  };
  const tokens = (zh: string) => text.readings[zh];

  return (
    <View style={styles.gap}>
      <View style={styles.gapSmall}>
        <ThemedText type="small" themeColor="tint">
          HSK {text.hsk_level} · {text.kind === 'dialogue' ? 'Dialogue' : 'Story'} · {text.char_count} characters
        </ThemedText>
        {tokens(text.title_zh) ? <RubyText tokens={tokens(text.title_zh)} size={30} /> : <ThemedText type="title">{text.title_zh}</ThemedText>}
        <ThemedText type="subtitle" themeColor="textSecondary">
          {text.title}
        </ThemedText>
      </View>

      <View style={styles.controls}>
        <Button
          label={current !== null ? '■ Stop' : '▶ Listen to the whole text'}
          variant={current !== null ? 'secondary' : 'primary'}
          onPress={() => (current !== null ? stopSpeech() : playFrom(0))}
        />
        <Pressable
          role="switch"
          aria-checked={translate}
          aria-label="Show translation"
          onPress={() => setTranslate((t) => !t)}
          style={[styles.toggle, { borderColor: translate ? theme.tint : theme.border, backgroundColor: translate ? theme.backgroundSelected : 'transparent' }]}>
          <ThemedText type="smallBold" themeColor={translate ? 'tint' : 'textSecondary'}>
            {translate ? 'Hide translation' : 'Show translation'}
          </ThemedText>
        </Pressable>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Tap a word for its meaning, or ▶ to listen from that sentence.
      </ThemedText>

      {text.new_words.length ? (
        <View style={[styles.newWords, { borderColor: theme.border }]}>
          <ThemedText type="smallBold">New words</ThemedText>
          {text.new_words.map((w) => (
            <ThemedText key={w.word} type="small">
              <ThemedText lang="zh" type="smallBold">
                {w.word}
              </ThemedText>{' '}
              {text.word_details[w.word]?.pinyin ?? ''} — {w.en}
            </ThemedText>
          ))}
        </View>
      ) : null}

      <View role="list" aria-label="Text" style={styles.gapSmall}>
        {text.sentences.map((s, i) => {
          const speaker = s.speaker !== undefined ? text.speakers[s.speaker] : null;
          const active = current === i;
          return (
            <View
              key={i}
              role="listitem"
              aria-current={active ? 'true' : undefined}
              style={[
                styles.sentence,
                { backgroundColor: active ? theme.backgroundSelected : 'transparent', borderColor: active ? theme.tint : 'transparent' },
              ]}>
              <Pressable
                role="button"
                aria-label={`Listen from sentence ${i + 1}`}
                onPress={() => playFrom(i)}
                hitSlop={6}
                style={styles.play}>
                <SymbolView name={{ ios: active ? 'speaker.wave.2.fill' : 'play.fill', web: active ? 'volume_up' : 'play_arrow' }} size={18} tintColor={theme.tint} />
              </Pressable>
              <View style={styles.flex}>
                {speaker ? (
                  <ThemedText type="smallBold" themeColor={s.speaker === 0 ? 'tint' : 'warning'} lang="zh">
                    {speaker.name}：
                  </ThemedText>
                ) : null}
                {tokens(s.zh) ? (
                  <RubyText
                    tokens={tokens(s.zh)}
                    size={22}
                    highlight={tapped?.sentence === i ? tapped.word : undefined}
                    onPressWord={(w) => setTapped({ word: w, sentence: i })}
                  />
                ) : (
                  <ThemedText lang="zh">{s.zh}</ThemedText>
                )}
                {translate ? <ThemedText themeColor="textSecondary">{s.en}</ThemedText> : null}
                {tapped?.sentence === i ? (
                  <WordPanel word={tapped.word} info={text.word_details[tapped.word]} onClose={() => setTapped(null)} />
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      <Questions text={text} />

      {text.grammar.length ? (
        <>
          <ThemedText type="heading">Grammar in this text</ThemedText>
          {text.grammar.map((g) => (
            <PressableLink
              key={g}
              href={{ pathname: '/grammar-point', params: { id: g } }}
              style={({ pressed }) => [styles.link, { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : theme.background }]}>
              <ThemedText type="link">{titles.get(g) ?? g}</ThemedText>
            </PressableLink>
          ))}
        </>
      ) : null}
    </View>
  );
}

/** Meaning of a tapped word, with save and a link to the dictionary. */
function WordPanel({ word, info, onClose }: { word: string; info?: WordInfo; onClose: () => void }) {
  const theme = useTheme();
  return (
    <View role="region" aria-label={`Word: ${word}`} style={[styles.panel, { borderColor: theme.tint, backgroundColor: theme.backgroundElement }]}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <ThemedText lang="zh" style={styles.panelWord}>
            {word}
          </ThemedText>
          {info?.pinyin ? <Pinyin text={info.pinyin} size={18} /> : null}
        </View>
        {info?.level && info.level <= 7 ? (
          <ThemedText type="small" themeColor="textSecondary">
            HSK {info.level === 7 ? '7–9' : info.level}
          </ThemedText>
        ) : null}
        <Pressable role="button" aria-label="Close word" onPress={onClose} hitSlop={10}>
          <SymbolView name={{ ios: 'xmark', web: 'close' }} size={18} tintColor={theme.textSecondary} />
        </Pressable>
      </View>
      <ThemedText>{info?.meanings.length ? info.meanings.join('; ') : 'No meaning found.'}</ThemedText>
      {info?.meanings[0] !== '(a name)' ? (
        <View style={styles.row}>
          <SaveButton word={word} />
          <ThemedText type="link" role="link" onPress={() => router.push({ pathname: '/word', params: { w: word } })}>
            Open in dictionary
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

function Questions({ text }: { text: ReadingRow }) {
  const theme = useTheme();
  const { session } = useAuth();
  const [answers, setAnswers] = useState<(number | null)[]>(() => text.questions.map(() => null));
  const complete = useCompleteReading();
  const done = answers.every((a) => a !== null);
  const score = readingScore(text.questions, answers);
  const { mutate, isIdle } = complete;
  useEffect(() => {
    if (done && session && isIdle) mutate({ id: text.id, score });
  }, [done, session, isIdle, mutate, text.id, score]);

  return (
    <Card title="Check your understanding">
      {text.questions.map((q, qi) => {
        const picked = answers[qi];
        return (
          <View key={qi} style={styles.gapSmall}>
            <ThemedText type="label">
              {qi + 1}. {q.prompt}
            </ThemedText>
            <View role="radiogroup" aria-label={q.prompt} style={styles.gapSmall}>
              {q.options.map((o, oi) => {
                const state = picked === null ? null : oi === q.answer ? 'right' : oi === picked ? 'wrong' : null;
                return (
                  <Pressable
                    key={oi}
                    role="radio"
                    aria-checked={picked === oi}
                    aria-label={o}
                    disabled={picked !== null}
                    onPress={() => setAnswers((a) => a.map((x, i) => (i === qi ? oi : x)))}
                    style={[
                      styles.option,
                      {
                        borderColor: state === 'right' ? theme.success : state === 'wrong' ? theme.danger : theme.border,
                        backgroundColor: theme.background,
                      },
                    ]}>
                    <ThemedText>{o}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
            {picked !== null ? (
              <ThemedText role="alert" themeColor={picked === q.answer ? 'success' : 'danger'}>
                {picked === q.answer ? '✓ ' : '✗ '}
                {q.why[picked]}
                {picked !== q.answer ? ` (${q.why[q.answer]})` : ''}
              </ThemedText>
            ) : null}
          </View>
        );
      })}
      {done ? (
        <ThemedText type="subtitle" role="status">
          {score}% right
          {session ? (complete.isSuccess ? ' · Saved' : complete.isError ? " · Couldn't save" : ' · Saving…') : ' · Log in to save your progress'}
        </ThemedText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.three },
  gapSmall: { gap: Spacing.two },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  toggle: { borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  newWords: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three, gap: Spacing.one },
  sentence: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, borderLeftWidth: 3, borderRadius: Radius.small, padding: Spacing.two },
  play: { paddingTop: Spacing.two },
  panel: { borderWidth: 2, borderRadius: Radius.medium, padding: Spacing.three, gap: Spacing.two },
  panelWord: { fontSize: 32, lineHeight: 42 },
  option: { borderWidth: 2, borderRadius: Radius.medium, padding: Spacing.three },
  link: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three },
});
