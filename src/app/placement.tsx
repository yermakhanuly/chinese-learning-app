import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CloseButton } from '@/components/close-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Hanzi, Pinyin } from '@/components/word-parts';
import { Radius, Spacing } from '@/constants/theme';
import { useCourse, type UnitWithLessons } from '@/hooks/use-course';
import { useUpdateProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { placementStep, type PlacementState } from '@/lib/placement';
import { seededShuffle } from '@/lib/lesson-flow';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useDisplayPreferences } from '@/providers/display-preferences';

type Word = { simplified: string; traditional: string; pinyin: string; meanings: string[] };

/**
 * Placement test: walks through the HSK 1 units in order, asking the meaning of words each unit
 * teaches. The first unit the learner doesn't know is where their path starts.
 */
export default function PlacementScreen() {
  const course = useCourse(1);
  const words = useQuery({
    queryKey: ['hsk-words', 1],
    staleTime: Infinity,
    queryFn: async (): Promise<Word[]> => {
      const { data, error } = await supabase.from('words').select('simplified, traditional, pinyin, meanings').eq('hsk_level', 1);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Screen title="Placement test" subtitle="Choose the meaning of each word. It's fine not to know." modal topAction={<CloseButton />}>
      {course.isPending || words.isPending ? (
        <ActivityIndicator />
      ) : course.isError || words.isError ? (
        <ThemedText themeColor="danger">Couldn&apos;t load the test. Check your connection.</ThemedText>
      ) : (
        <Test units={course.data} words={words.data} />
      )}
    </Screen>
  );
}

function Test({ units, words }: { units: UnitWithLessons[]; words: Word[] }) {
  const byWord = useMemo(() => new Map(words.map((w) => [w.simplified, w])), [words]);
  // A fresh random order each time the test is taken.
  const [seed] = useState(() => String(Math.random()));
  const unitWords = useMemo(
    () =>
      units.map((u) =>
        seededShuffle(
          u.lessons.flatMap((l) => l.words).filter((w) => byWord.has(w)),
          `${seed}-${u.id}`,
        ),
      ),
    [units, byWord, seed],
  );
  const [state, setState] = useState<PlacementState>({ unit: 0, asked: 0, right: 0, answered: 0, result: null });

  if (state.result !== null) return <Result units={units} unitIndex={state.result} answered={state.answered} />;

  const word = byWord.get(unitWords[state.unit][state.asked % unitWords[state.unit].length])!;
  const others = words.filter((w) => w.simplified !== word.simplified);
  const options = seededShuffle(
    [word, ...seededShuffle(others, `${seed}-${state.answered}`).slice(0, 3)],
    `${seed}-o-${state.answered}`,
  );

  const answer = (correct: boolean) => setState((s) => placementStep(s, correct, units.length));

  return (
    <QuestionCard
      key={state.answered}
      word={word}
      options={options}
      progress={`Unit ${state.unit + 1} of ${units.length}`}
      onAnswer={answer}
    />
  );
}

function QuestionCard({
  word,
  options,
  progress,
  onAnswer,
}: {
  word: Word;
  options: Word[];
  progress: string;
  onAnswer: (correct: boolean) => void;
}) {
  const theme = useTheme();
  const { showPinyin } = useDisplayPreferences();
  return (
    <View style={styles.gap}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {progress}
      </ThemedText>
      <View style={[styles.word, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Hanzi simplified={word.simplified} traditional={word.traditional} size={56} />
        {showPinyin ? <Pinyin text={word.pinyin} size={20} /> : null}
      </View>
      <ThemedText type="subtitle">What does it mean?</ThemedText>
      <View role="radiogroup" aria-label="What does it mean?" style={styles.options}>
        {options.map((o) => (
          <Pressable
            key={o.simplified}
            role="radio"
            aria-checked={false}
            aria-label={o.meanings.slice(0, 2).join('; ')}
            onPress={() => onAnswer(o.simplified === word.simplified)}
            style={({ pressed }) => [
              styles.option,
              { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
            ]}>
            <ThemedText>{o.meanings.slice(0, 2).join('; ')}</ThemedText>
          </Pressable>
        ))}
      </View>
      <Button label="I don't know" variant="ghost" onPress={() => onAnswer(false)} />
    </View>
  );
}

function Result({ units, unitIndex, answered }: { units: UnitWithLessons[]; unitIndex: number; answered: number }) {
  const { session } = useAuth();
  const update = useUpdateProfile();
  const passedAll = unitIndex >= units.length;
  const unit = units[Math.min(unitIndex, units.length - 1)];
  // Knows everything: start with the last unit's quiz as a final check.
  const start = passedAll ? unit.lessons[unit.lessons.length - 1] : unit.lessons[0];
  const [error, setError] = useState<string | null>(null);

  async function begin() {
    setError(null);
    if (session) {
      try {
        await update.mutateAsync({ start_lesson_id: start.id, placed_at: new Date().toISOString() });
      } catch {
        setError("Couldn't save your result. Check your connection and try again.");
        return;
      }
    }
    router.replace({ pathname: '/lesson', params: { id: start.id } });
  }

  return (
    <Card title={unitIndex === 0 ? 'Start from the beginning' : passedAll ? 'You know HSK 1 well!' : `Start at Unit ${unit.position}`}>
      <ThemedText>
        {unitIndex === 0
          ? 'Unit 1 teaches the basics: greetings and introductions.'
          : passedAll
            ? 'Try the final unit quiz. HSK 2 lessons come later.'
            : `You already know the words of the first ${unitIndex} unit${unitIndex === 1 ? '' : 's'}. Your path starts with “${unit.title}”.`}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {answered} questions. You can open any lesson from the Learn tab at any time.
      </ThemedText>
      {error ? (
        <ThemedText role="alert" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
      <Button label={`Start: ${start.title}`} loading={update.isPending} onPress={begin} />
      {!session ? (
        <ThemedText type="small" themeColor="textSecondary">
          Log in to keep this starting point.
        </ThemedText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.three },
  word: { alignItems: 'center', gap: Spacing.one, padding: Spacing.four, borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth },
  options: { gap: Spacing.two },
  option: { borderWidth: 1, borderRadius: Radius.medium, padding: Spacing.three, minHeight: 56, justifyContent: 'center' },
});
