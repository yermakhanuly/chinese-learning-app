import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { closeModal } from '@/components/close-button';
import { BuildExercise, ChoiceExercise, FillExercise, GrammarStep, LessonDataContext, WordStep } from '@/components/lesson/lesson-parts';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { allLessons, useCompleteLesson, useCourse, useLesson, type LessonContent } from '@/hooks/use-course';
import { useTheme } from '@/hooks/use-theme';
import {
  advance,
  correctAnswerText,
  grade,
  isExercise,
  missedWords,
  progressFraction,
  score as scoreOf,
  startFlow,
  type Answer,
} from '@/lib/lesson-flow';
import { useAuth } from '@/providers/auth';

/** /lesson?id=hsk1-u01-l1 — plays one lesson or unit quiz. */
export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const lesson = useLesson(id);
  const theme = useTheme();

  if (lesson.isPending) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!lesson.data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ThemedText>{lesson.isError ? "Couldn't load this lesson. Check your connection." : 'Lesson not found.'}</ThemedText>
        <Button label="Back" variant="secondary" onPress={closeModal} />
      </View>
    );
  }
  // Keyed by id so moving to the next lesson starts fresh.
  return <Player key={lesson.data.id} lesson={lesson.data} />;
}

function Player({ lesson }: { lesson: LessonContent }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const steps = lesson.steps;
  const [flow, setFlow] = useState(() => startFlow(steps));
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [result, setResult] = useState<'right' | 'wrong' | null>(null);
  // Bumps on every move so a re-asked exercise mounts fresh.
  const [turn, setTurn] = useState(0);

  const course = useCourse(1);
  // What this lesson is about, for the mistake notebook: its new words, or (quiz) the unit's words.
  const focus = useMemo(() => {
    if (lesson.words.length) return new Set(lesson.words);
    const unit = course.data?.find((u) => u.id === lesson.unit_id);
    return new Set(unit?.lessons.flatMap((l) => l.words) ?? []);
  }, [lesson, course.data]);

  const current = flow.queue[0];
  const step = current === undefined ? null : steps[current];
  const data = useMemo(
    () => ({ readings: lesson.readings, wordDetails: lesson.word_details, seed: lesson.id }),
    [lesson],
  );

  function next(correct: boolean) {
    setFlow((f) => advance(f, steps, correct));
    setAnswer(null);
    setResult(null);
    setTurn((t) => t + 1);
  }

  if (!step) {
    return <Finished lesson={lesson} score={scoreOf(flow, steps)} missed={missedWords(flow, steps, lesson.readings, focus)} />;
  }

  const exercise = isExercise(step);
  const canCheck = answer !== null && (!Array.isArray(answer) || answer.length > 0);

  function onPrimary() {
    if (!exercise) return next(true);
    if (result) return next(result === 'right');
    setResult(grade(step!, answer!) ? 'right' : 'wrong');
  }

  const props = { index: current, answer, onChange: setAnswer, checked: result !== null };
  return (
    <LessonDataContext value={data}>
      <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.topBar}>
          <Pressable role="button" aria-label="Close lesson" onPress={closeModal} hitSlop={12}>
            <SymbolView name={{ ios: 'xmark', web: 'close' }} size={22} tintColor={theme.textSecondary} />
          </Pressable>
          <View
            role="progressbar"
            aria-label="Lesson progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressFraction(flow, steps) * 100)}
            style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
            <View
              style={[styles.fill, { backgroundColor: theme.tint, width: `${progressFraction(flow, steps) * 100}%` }]}
            />
          </View>
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View key={turn} style={styles.inner}>
            {flow.missed.includes(current) && result === null ? (
              <ThemedText type="smallBold" themeColor="tint">
                LET&apos;S TRY THIS AGAIN
              </ThemedText>
            ) : null}
            {step.type === 'word' ? <WordStep word={step.word} /> : null}
            {step.type === 'grammar' ? <GrammarStep step={step} /> : null}
            {step.type === 'choice' ? <ChoiceExercise step={step} {...props} /> : null}
            {step.type === 'fill' ? <FillExercise step={step} {...props} /> : null}
            {step.type === 'build' ? <BuildExercise step={step} {...props} /> : null}
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + Spacing.three,
              borderTopColor: theme.border,
              backgroundColor:
                result === 'right' ? theme.backgroundElement : result === 'wrong' ? theme.backgroundElement : theme.background,
            },
          ]}>
          <View style={styles.inner}>
            {result ? (
              <View role="alert" style={styles.feedback}>
                <ThemedText type="subtitle" themeColor={result === 'right' ? 'success' : 'danger'}>
                  {result === 'right' ? 'Correct! 对了！' : 'Not quite'}
                </ThemedText>
                {result === 'wrong' ? (
                  <ThemedText>
                    Correct answer: <ThemedText type="label">{correctAnswerText(step)}</ThemedText>
                  </ThemedText>
                ) : null}
              </View>
            ) : null}
            <Button
              label={!exercise || result ? 'Continue' : 'Check'}
              disabled={exercise && !result && !canCheck}
              variant={result === 'wrong' ? 'danger' : 'primary'}
              onPress={onPrimary}
            />
          </View>
        </View>
      </View>
    </LessonDataContext>
  );
}

function Finished({ lesson, score, missed }: { lesson: LessonContent; score: number; missed: string[] }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const complete = useCompleteLesson();
  const course = useCourse(1);
  // Save once when this screen appears (signed-in learners only).
  const { mutate, isIdle } = complete;
  const [missedOnce] = useState(missed);
  useEffect(() => {
    if (session && isIdle) mutate({ lessonId: lesson.id, score, missed: missedOnce });
  }, [session, isIdle, mutate, lesson.id, score, missedOnce]);

  const lessons = course.data ? allLessons(course.data) : [];
  const next = lessons[lessons.findIndex((l) => l.id === lesson.id) + 1];

  return (
    <View style={[styles.center, { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={[styles.inner, styles.finished]}>
        <ThemedText style={styles.trophy}>{score >= 80 ? '🎉' : '👍'}</ThemedText>
        <ThemedText type="title" style={styles.centerText}>
          {lesson.kind === 'quiz' ? 'Quiz complete!' : 'Lesson complete!'}
        </ThemedText>
        <ThemedText type="subtitle" style={styles.centerText}>
          {score}% right first time
        </ThemedText>
        {lesson.words.length ? (
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            New words: {lesson.words.join(' · ')}
          </ThemedText>
        ) : null}
        <ThemedText themeColor="textSecondary" style={styles.centerText} role="status">
          {!session
            ? 'Log in to save your progress.'
            : complete.isIdle || complete.isPending
              ? 'Saving…'
              : complete.isError
                ? "Couldn't save your progress. Check your connection."
                : 'Progress saved.'}
        </ThemedText>
        {session && complete.isSuccess && lesson.words.length ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
            The new words are now in your Review deck.
          </ThemedText>
        ) : null}
        <View style={styles.finishButtons}>
          {next ? (
            <Button label={`Next: ${next.title}`} onPress={() => router.replace({ pathname: '/lesson', params: { id: next.id } })} />
          ) : null}
          {!session ? <Button label="Log in" variant="secondary" onPress={() => router.push('/sign-in')} /> : null}
          <Button label="Back to lessons" variant={next ? 'ghost' : 'primary'} onPress={() => router.replace('/learn')} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.three },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  track: { flex: 1, height: 12, borderRadius: Radius.small, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.small },
  body: { padding: Spacing.three, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.three, paddingHorizontal: Spacing.three, alignItems: 'center' },
  feedback: { gap: Spacing.one },
  finished: { alignItems: 'center' },
  trophy: { fontSize: 64, lineHeight: 80 },
  centerText: { textAlign: 'center' },
  finishButtons: { width: '100%', gap: Spacing.two, marginTop: Spacing.three },
});
