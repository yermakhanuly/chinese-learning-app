import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { closeModal } from '@/components/close-button';
import { BuildExercise, ChoiceExercise, FillExercise, LessonDataContext } from '@/components/lesson/lesson-parts';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useCompleteGrammar, useGrammarPoint, type GrammarPointRow } from '@/hooks/use-grammar';
import { useHydrated } from '@/hooks/use-hydrated';
import { useTheme } from '@/hooks/use-theme';
import { exerciseToStep, explanation } from '@/lib/grammar';
import { advance, correctAnswerText, grade, progressFraction, score as scoreOf, startFlow, type Answer } from '@/lib/lesson-flow';
import { useAuth } from '@/providers/auth';

/**
 * /grammar-practice?id=g1-shi — the exercises of one grammar point, each answer explained.
 * `&only=0,3` practises just those exercises (from the mistake notebook).
 */
export default function GrammarPracticeScreen() {
  const hydrated = useHydrated();
  const { id, only } = useLocalSearchParams<{ id?: string; only?: string }>();
  const point = useGrammarPoint(hydrated ? id : undefined);
  const theme = useTheme();

  if (!hydrated || point.isPending) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!point.data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ThemedText>{point.isError ? "Couldn't load the exercises. Check your connection." : 'Grammar point not found.'}</ThemedText>
        <Button label="Back" variant="secondary" onPress={closeModal} />
      </View>
    );
  }
  const subset = (only ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n < point.data!.exercises.length);
  return <Player key={`${point.data.id}-${only ?? ''}`} point={point.data} subset={subset.length ? [...new Set(subset)] : null} />;
}

function Player({ point, subset }: { point: GrammarPointRow; subset: number[] | null }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // Which exercises of the point this session uses (original indexes).
  const indexes = useMemo(() => subset ?? point.exercises.map((_, i) => i), [point, subset]);
  const steps = useMemo(() => indexes.map((i) => exerciseToStep(point.exercises[i])), [point, indexes]);
  const [flow, setFlow] = useState(() => startFlow(steps));
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [result, setResult] = useState<'right' | 'wrong' | null>(null);
  const [turn, setTurn] = useState(0);
  const data = useMemo(() => ({ readings: point.readings, wordDetails: {}, seed: point.id }), [point]);

  const current = flow.queue[0];
  if (current === undefined) {
    return <Finished point={point} score={scoreOf(flow, steps)} missed={flow.missed.map((i) => indexes[i])} subset={!!subset} />;
  }
  const step = steps[current];
  const exercise = point.exercises[indexes[current]];
  const canCheck = answer !== null && (!Array.isArray(answer) || answer.length > 0);

  function onPrimary() {
    if (result) {
      setFlow((f) => advance(f, steps, result === 'right'));
      setAnswer(null);
      setResult(null);
      setTurn((t) => t + 1);
      return;
    }
    setResult(grade(step, answer!) ? 'right' : 'wrong');
  }

  const props = { index: current, answer, onChange: setAnswer, checked: result !== null };
  const why = result ? explanation(exercise, typeof answer === 'number' ? answer : null) : '';
  const progress = progressFraction(flow, steps);
  return (
    <LessonDataContext value={data}>
      <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.topBar}>
          <Pressable role="button" aria-label="Close practice" onPress={closeModal} hitSlop={12}>
            <SymbolView name={{ ios: 'xmark', web: 'close' }} size={22} tintColor={theme.textSecondary} />
          </Pressable>
          <View
            role="progressbar"
            aria-label="Practice progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
            <View style={[styles.fill, { backgroundColor: theme.tint, width: `${progress * 100}%` }]} />
          </View>
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View key={turn} style={styles.inner}>
            <ThemedText type="smallBold" themeColor="tint">
              {flow.missed.includes(current) && result === null ? "LET'S TRY THIS AGAIN" : point.title.toUpperCase()}
            </ThemedText>
            {step.type === 'choice' ? <ChoiceExercise step={step} {...props} /> : null}
            {step.type === 'fill' ? <FillExercise step={step} {...props} /> : null}
            {step.type === 'build' ? <BuildExercise step={step} {...props} /> : null}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three, borderTopColor: theme.border }]}>
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
                <ThemedText themeColor="textSecondary">{why}</ThemedText>
              </View>
            ) : null}
            <Button
              label={result ? 'Continue' : 'Check'}
              disabled={!result && !canCheck}
              variant={result === 'wrong' ? 'danger' : 'primary'}
              onPress={onPrimary}
            />
          </View>
        </View>
      </View>
    </LessonDataContext>
  );
}

function Finished({ point, score, missed, subset }: { point: GrammarPointRow; score: number; missed: number[]; subset: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const complete = useCompleteGrammar();
  const { mutate, isIdle } = complete;
  const [saved] = useState({ score, missed });
  // A practice of only the missed exercises doesn't count as a score for the point.
  useEffect(() => {
    if (session && isIdle && !subset) mutate({ id: point.id, score: saved.score, missed: saved.missed });
  }, [session, isIdle, mutate, point.id, saved, subset]);

  return (
    <View style={[styles.center, { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={[styles.inner, styles.finished]}>
        <ThemedText style={styles.trophy}>{score >= 80 ? '🎉' : '👍'}</ThemedText>
        <ThemedText type="title" style={styles.centerText}>
          Practice complete!
        </ThemedText>
        <ThemedText type="subtitle" style={styles.centerText}>
          {score}% right first time
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centerText}>
          {point.title}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centerText} role="status">
          {subset
            ? 'Missed exercises practised.'
            : !session
              ? 'Log in to save your progress.'
              : complete.isIdle || complete.isPending
                ? 'Saving…'
                : complete.isError
                  ? "Couldn't save your progress. Check your connection."
                  : missed.length
                    ? 'Progress saved. Missed exercises are in your mistake notebook.'
                    : 'Progress saved.'}
        </ThemedText>
        <View style={styles.finishButtons}>
          <Button label="Practise again" variant="secondary" onPress={() => router.replace({ pathname: '/grammar-practice', params: { id: point.id } })} />
          <Button label="Done" onPress={closeModal} />
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
