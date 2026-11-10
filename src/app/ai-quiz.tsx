import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CloseButton, closeModal } from '@/components/close-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { PremiumGate } from '@/components/tutor/tutor-parts';
import { Radius, Spacing } from '@/constants/theme';
import { useSaveQuizOnce } from '@/hooks/use-progress';
import { useAiQuiz, useIsPremium } from '@/hooks/use-tutor';
import { useTheme } from '@/hooks/use-theme';
import { quizScore, type AiQuizQuestion } from '@/lib/tutor';

/** A quiz the tutor writes from the learner's recent and weak words (Premium). */
export default function AiQuizScreen() {
  return (
    <Screen title="Quiz on your words" modal topAction={<CloseButton />}>
      <PremiumGate feature="AI quizzes">
        <QuizLoader />
      </PremiumGate>
    </Screen>
  );
}

function QuizLoader() {
  const quiz = useAiQuiz();
  const { premium } = useIsPremium();
  const [round, setRound] = useState(0);
  const { mutate } = quiz;
  useEffect(() => {
    if (premium) mutate();
  }, [premium, round, mutate]);

  if (quiz.isError) {
    return (
      <Card>
        <ThemedText role="alert" themeColor="danger">
          {quiz.error.message}
        </ThemedText>
        <Button label="Try again" onPress={() => setRound((r) => r + 1)} />
      </Card>
    );
  }
  if (!quiz.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <ThemedText themeColor="textSecondary">Writing a quiz from your recent words…</ThemedText>
      </View>
    );
  }
  return <Quiz key={round} questions={quiz.data} onAgain={() => setRound((r) => r + 1)} />;
}

function Quiz({ questions, onAgain }: { questions: AiQuizQuestion[]; onAgain: () => void }) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const done = index >= questions.length;
  const { correct, total } = quizScore(questions, answers);
  useSaveQuizOnce('ai_quiz', 'words', correct, total, done);

  if (done) {
    return (
      <Card title={`${correct} / ${total} right`}>
        <ThemedText themeColor="textSecondary">
          {correct === total ? 'Perfect! 🎉' : 'Words you missed come back in your reviews and the next quiz.'}
        </ThemedText>
        <Button label="New quiz" onPress={onAgain} />
        <Button label="Done" variant="secondary" onPress={closeModal} />
      </Card>
    );
  }

  const q = questions[index];
  const picked = answers[index];
  return (
    <Card>
      <ThemedText type="small" themeColor="textSecondary">
        Question {index + 1} of {questions.length}
      </ThemedText>
      <ThemedText type="heading">{q.prompt}</ThemedText>
      {q.zh ? (
        <ThemedText lang="zh" style={styles.zh}>
          {q.zh}
        </ThemedText>
      ) : null}
      <View role="radiogroup" aria-label="Answers" style={styles.options}>
        {q.options.map((o, i) => {
          const right = picked !== null && i === q.answer;
          const wrong = picked === i && i !== q.answer;
          return (
            <Pressable
              key={i}
              role="radio"
              aria-checked={picked === i}
              aria-label={o}
              disabled={picked !== null}
              onPress={() => setAnswers((a) => a.map((v, j) => (j === index ? i : v)))}
              style={({ pressed }) => [
                styles.option,
                {
                  borderColor: right ? theme.success : wrong ? theme.danger : theme.border,
                  backgroundColor: pressed ? theme.backgroundSelected : theme.background,
                },
              ]}>
              <ThemedText lang="zh" type="label">
                {right ? '✓ ' : wrong ? '✗ ' : ''}
                {o}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {picked !== null ? (
        <>
          <ThemedText role="status" themeColor={picked === q.answer ? 'success' : 'danger'}>
            {picked === q.answer ? 'Right! ' : 'Not quite. '}
            {q.why}
          </ThemedText>
          <Button label={index + 1 < questions.length ? 'Next' : 'See result'} onPress={() => setIndex((i) => i + 1)} />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.four },
  zh: { fontSize: 26, lineHeight: 36 },
  options: { gap: Spacing.two },
  option: { borderWidth: 1.5, borderRadius: Radius.small + 2, padding: Spacing.three },
});
