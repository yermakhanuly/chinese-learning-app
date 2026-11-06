import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { CloseButton } from '@/components/close-button';
import { Screen } from '@/components/screen';
import { AudioQuiz } from '@/components/speaking/audio-quiz';
import { ThemedText } from '@/components/themed-text';
import { TONE_PAIRS } from '@/constants/tones';
import { useWordsInfo } from '@/hooks/use-audio';
import { useHydrated } from '@/hooks/use-hydrated';
import { syllableToneQuestions, wordToneQuestions, type ToneWord } from '@/lib/listening-quiz';

const PAIR_WORDS = TONE_PAIRS.flatMap((p) => p.words);

/** /tone-quiz?mode=syllable|word — hear it, pick the tones. */
export default function ToneQuizScreen() {
  const hydrated = useHydrated();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const words = mode === 'word';
  return (
    <Screen title={hydrated ? (words ? 'Tone quiz: words' : 'Tone quiz: syllables') : ''} modal topAction={<CloseButton />}>
      {!hydrated ? <ActivityIndicator /> : words ? <WordQuiz /> : <SyllableQuiz />}
    </Screen>
  );
}

function SyllableQuiz() {
  const [questions] = useState(() => syllableToneQuestions());
  return <AudioQuiz questions={questions} />;
}

function WordQuiz() {
  const info = useWordsInfo(PAIR_WORDS);
  if (info.isError) return <ThemedText themeColor="danger">Couldn&apos;t load the quiz. Check your connection.</ThemedText>;
  if (!info.data) return <ActivityIndicator />;
  return <WordQuizReady words={[...info.data.values()]} />;
}

function WordQuizReady({ words }: { words: ToneWord[] }) {
  const [questions] = useState(() => wordToneQuestions(words));
  return <AudioQuiz questions={questions} />;
}
