import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { closeModal } from '@/components/close-button';
import { ThemedText } from '@/components/themed-text';
import { SpeakButton } from '@/components/word-parts';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { speakChinese } from '@/lib/speech';

export type AudioQuestion = {
  /** What to play (a clip text such as "你好" or "tone:ma3"). */
  audio: string;
  /** What the device voice reads if there's no clip. */
  fallback?: string;
  prompt: string;
  options: string[];
  answer: number;
  /** Options are Chinese (bigger font, lang="zh"). */
  zhOptions?: boolean;
  /** Shown after answering, e.g. the characters and pinyin. */
  reveal?: string;
};

/** Listen → pick the answer, 10 questions, then a score. Audio plays when each question appears. */
export function AudioQuiz({ questions }: { questions: AudioQuestion[] }) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const q = questions[index];

  useEffect(() => {
    if (q) speakChinese(q.audio, `quiz-${index}`, q.fallback ?? q.audio);
  }, [q, index]);

  if (!q) {
    return (
      <Card title={right === questions.length ? 'Excellent! 🎉' : 'Quiz complete'}>
        <ThemedText type="subtitle" role="status">
          {right} of {questions.length} right
        </ThemedText>
        <Button label="Done" onPress={closeModal} />
      </Card>
    );
  }

  return (
    <View style={styles.gap}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        Question {index + 1} of {questions.length}
      </ThemedText>
      <Card>
        <View style={styles.promptRow}>
          <SpeakButton text={q.audio} label="Play again" size={64} />
          <ThemedText type="subtitle" style={styles.flex}>
            {q.prompt}
          </ThemedText>
        </View>
        {picked !== null && q.reveal ? (
          <ThemedText lang="zh" type="label">
            {q.reveal}
          </ThemedText>
        ) : null}
      </Card>
      <View role="radiogroup" aria-label={q.prompt} style={styles.options}>
        {q.options.map((o, i) => {
          const state = picked === null ? null : i === q.answer ? 'right' : i === picked ? 'wrong' : null;
          return (
            <Pressable
              key={`${o}-${i}`}
              role="radio"
              aria-checked={picked === i}
              aria-label={o}
              disabled={picked !== null}
              onPress={() => {
                setPicked(i);
                if (i === q.answer) setRight((r) => r + 1);
              }}
              style={({ pressed }) => [
                styles.option,
                {
                  borderColor: state === 'right' ? theme.success : state === 'wrong' ? theme.danger : theme.border,
                  backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                },
              ]}>
              <ThemedText lang={q.zhOptions ? 'zh' : undefined} style={q.zhOptions ? styles.zhOption : undefined}>
                {o}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {picked !== null ? (
        <>
          <ThemedText role="alert" type="subtitle" themeColor={picked === q.answer ? 'success' : 'danger'}>
            {picked === q.answer ? 'Correct!' : `Answer: ${q.options[q.answer]}`}
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

const styles = StyleSheet.create({
  gap: { gap: Spacing.three },
  flex: { flex: 1 },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  options: { gap: Spacing.two },
  option: { borderWidth: 2, borderRadius: Radius.medium, padding: Spacing.three, minHeight: 56, justifyContent: 'center' },
  zhOption: { fontSize: 28, lineHeight: 38 },
});
