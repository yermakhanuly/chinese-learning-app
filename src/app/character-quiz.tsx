import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { WritingPad } from '@/components/character/character-svg';
import { CloseButton, closeModal } from '@/components/close-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Pinyin, SpeakButton } from '@/components/word-parts';
import { LOOK_ALIKES } from '@/constants/look-alikes';
import { Radius, Spacing } from '@/constants/theme';
import {
  useCharacterList,
  useCharacterSummaries,
  useCharacters,
  useLearnedCharacters,
  type CharacterSummary,
} from '@/hooks/use-characters';
import { useHydrated } from '@/hooks/use-hydrated';
import { useTheme } from '@/hooks/use-theme';
import { lookAlikeQuestions, pickWritingCharacters, recognitionQuestions, type ChoiceQuestion } from '@/lib/character-quiz';
import { useAuth } from '@/providers/auth';

type Mode = 'recognition' | 'lookalike' | 'write';
const TITLES: Record<Mode, string> = {
  recognition: 'Recognition quiz',
  lookalike: 'Look-alike drill',
  write: 'Write from memory',
};

/** /character-quiz?mode=recognition|lookalike|write&level=1 */
export default function CharacterQuizScreen() {
  const hydrated = useHydrated();
  const params = useLocalSearchParams<{ mode?: string; level?: string }>();
  const mode: Mode = params.mode === 'lookalike' || params.mode === 'write' ? params.mode : 'recognition';
  const level = /^[1-7]$/.test(params.level ?? '') ? Number(params.level) : 1;

  return (
    <Screen title={hydrated ? TITLES[mode] : ''} modal topAction={<CloseButton />}>
      {!hydrated ? (
        <ActivityIndicator />
      ) : mode === 'write' ? (
        <WriteQuiz level={level} />
      ) : mode === 'lookalike' ? (
        <LookAlikeQuiz />
      ) : (
        <RecognitionQuiz level={level} />
      )}
    </Screen>
  );
}

function Loading({ error }: { error?: boolean }) {
  return error ? (
    <ThemedText themeColor="danger">Couldn&apos;t load the quiz. Check your connection.</ThemedText>
  ) : (
    <ActivityIndicator />
  );
}

function RecognitionQuiz({ level }: { level: number }) {
  const list = useCharacterList(level);
  const questions = useMemo(() => (list.data ? recognitionQuestions(list.data) : null), [list.data]);
  if (!questions) return <Loading error={list.isError} />;
  return <ChoiceQuiz questions={questions} />;
}

function LookAlikeQuiz() {
  const all = useMemo(() => [...new Set(LOOK_ALIKES.flat())], []);
  const info = useCharacterSummaries(all);
  const questions = useMemo(() => (info.data ? lookAlikeQuestions(LOOK_ALIKES, info.data) : null), [info.data]);
  if (!questions) return <Loading error={info.isError} />;
  return <ChoiceQuiz questions={questions} />;
}

/** Prompt (sound + meaning) → pick the character. */
function ChoiceQuiz({ questions }: { questions: ChoiceQuestion[] }) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [right, setRight] = useState(0);

  if (index >= questions.length) return <Result right={right} total={questions.length} />;
  const q = questions[index];
  const correct = picked === q.target.character;

  return (
    <View style={styles.gap}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        Question {index + 1} of {questions.length}
      </ThemedText>
      <Card>
        <ThemedText themeColor="textSecondary">Which character is…</ThemedText>
        <View style={styles.promptRow}>
          <View style={styles.flex}>
            <Pinyin text={q.target.pinyin.join(', ')} size={24} />
            <ThemedText type="subtitle">{q.target.definition}</ThemedText>
          </View>
          <SpeakButton text={q.target.character} label="Play the sound" size={44} />
        </View>
      </Card>
      <View role="radiogroup" aria-label="Choose the character" style={styles.options}>
        {q.options.map((o) => {
          const isAnswer = o === q.target.character;
          const state = picked === null ? null : isAnswer ? 'right' : o === picked ? 'wrong' : null;
          return (
            <Pressable
              key={o}
              role="radio"
              aria-checked={picked === o}
              aria-label={o}
              disabled={picked !== null}
              onPress={() => {
                setPicked(o);
                if (isAnswer) setRight((r) => r + 1);
              }}
              style={({ pressed }) => [
                styles.option,
                {
                  borderColor: state === 'right' ? theme.success : state === 'wrong' ? theme.danger : theme.border,
                  backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                },
              ]}>
              <ThemedText lang="zh" style={styles.optionText}>
                {o}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {picked ? (
        <>
          <ThemedText role="alert" type="subtitle" themeColor={correct ? 'success' : 'danger'}>
            {correct ? 'Correct!' : `It's ${q.target.character}`}
          </ThemedText>
          <Button
            label={index + 1 < questions.length ? 'Next' : 'See result'}
            onPress={() => {
              setPicked(null);
              setIndex((i) => i + 1);
            }}
          />
        </>
      ) : null}
    </View>
  );
}

function WriteQuiz({ level }: { level: number }) {
  const { session } = useAuth();
  const learned = useLearnedCharacters();
  const list = useCharacterList(level);
  if (!list.data || (session && !learned.data)) return <Loading error={list.isError || learned.isError} />;
  return <WritePicker learned={learned.data ?? []} levelChars={list.data.map((c: CharacterSummary) => c.character)} />;
}

/** Picks the characters once, so refetches don't reshuffle a quiz in progress. */
function WritePicker({ learned, levelChars }: { learned: string[]; levelChars: string[] }) {
  const [picked] = useState(() => pickWritingCharacters(learned, levelChars));
  const data = useCharacters(picked);
  if (!data.data) return <Loading error={data.isError} />;
  // Learned characters without stroke data (rare) are skipped.
  return <WriteSession chars={picked.filter((c) => data.data.has(c))} info={data.data} />;
}

function WriteSession({ chars, info }: { chars: string[]; info: NonNullable<ReturnType<typeof useCharacters>['data']> }) {
  const [index, setIndex] = useState(0);
  const [perfect, setPerfect] = useState(0);
  const [done, setDone] = useState<null | { perfect: boolean }>(null);

  if (index >= chars.length) return <Result right={perfect} total={chars.length} unit="perfect" />;
  const c = info.get(chars[index])!;
  return (
    <View style={styles.gap}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        Character {index + 1} of {chars.length}
      </ThemedText>
      <Card>
        <ThemedText themeColor="textSecondary">Write the character for…</ThemedText>
        <View style={styles.promptRow}>
          <View style={styles.flex}>
            <Pinyin text={c.pinyin.join(', ')} size={24} />
            <ThemedText type="subtitle">{c.definition ?? ''}</ThemedText>
          </View>
          <SpeakButton text={c.character} label="Play the sound" size={44} />
        </View>
      </Card>
      <WritingPad
        key={c.character}
        character="the character"
        data={c}
        mode="memory"
        onComplete={(r) => {
          const ok = r.misses === 0 && !r.hinted;
          if (ok) setPerfect((p) => p + 1);
          setDone({ perfect: ok });
        }}
      />
      {done ? (
        <Button
          label={index + 1 < chars.length ? 'Next character' : 'See result'}
          onPress={() => {
            setDone(null);
            setIndex((i) => i + 1);
          }}
        />
      ) : null}
    </View>
  );
}

function Result({ right, total, unit = 'right' }: { right: number; total: number; unit?: string }) {
  return (
    <Card title={right === total ? 'Excellent! 🎉' : 'Quiz complete'}>
      <ThemedText type="subtitle" role="status">
        {right} of {total} {unit}
      </ThemedText>
      <Button label="Done" onPress={closeModal} />
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.three },
  flex: { flex: 1 },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  option: {
    flexGrow: 1,
    flexBasis: '40%',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three,
  },
  optionText: { fontSize: 44, lineHeight: 58 },
});
