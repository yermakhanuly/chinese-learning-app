import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { CloseButton } from '@/components/close-button';
import { Screen } from '@/components/screen';
import { AudioQuiz } from '@/components/speaking/audio-quiz';
import { ThemedText } from '@/components/themed-text';
import { useClips, useSentenceTranslations, useWordsInfo, type WordPinyin } from '@/hooks/use-audio';
import { useHydrated } from '@/hooks/use-hydrated';
import { shuffle } from '@/lib/character-quiz';
import { sentenceMeaningQuestions, wordCharacterQuestions } from '@/lib/listening-quiz';

/** /listening-quiz?mode=sentence|word&level=1 — hear it, pick the meaning (or the characters). */
export default function ListeningQuizScreen() {
  const hydrated = useHydrated();
  const params = useLocalSearchParams<{ mode?: string; level?: string }>();
  const words = params.mode === 'word';
  const level = /^[1-4]$/.test(params.level ?? '') ? Number(params.level) : 1;
  return (
    <Screen title={hydrated ? `Listening: ${words ? 'words' : 'sentences'} · HSK ${level}` : ''} modal topAction={<CloseButton />}>
      {!hydrated ? <ActivityIndicator /> : words ? <WordQuiz level={level} /> : <SentenceQuiz level={level} />}
    </Screen>
  );
}

const Failed = () => <ThemedText themeColor="danger">Couldn&apos;t load the quiz. Check your connection.</ThemedText>;

function SentenceQuiz({ level }: { level: number }) {
  const clips = useClips('sentence', level);
  // A random sample of the level's recorded sentences that have a translation.
  const sample = useMemo(() => (clips.data ? shuffle(clips.data).slice(0, 40).map((c) => c.text) : []), [clips.data]);
  const english = useSentenceTranslations(sample);
  if (clips.isError || english.isError) return <Failed />;
  if (!english.data) return <ActivityIndicator />;
  if (english.data.length < 4) return <ThemedText>No recorded sentences for this level yet.</ThemedText>;
  return <SentenceQuizReady sentences={english.data} level={level} />;
}

function SentenceQuizReady({ sentences, level }: { sentences: { simplified: string; english: string }[]; level: number }) {
  const [questions] = useState(() => sentenceMeaningQuestions(sentences));
  return <AudioQuiz questions={questions} record={{ kind: 'listening', ref: `sentence-${level}` }} />;
}

function WordQuiz({ level }: { level: number }) {
  const clips = useClips('word', level);
  const sample = useMemo(() => (clips.data ? shuffle(clips.data).slice(0, 40).map((c) => c.text) : []), [clips.data]);
  const info = useWordsInfo(sample);
  if (clips.isError || info.isError) return <Failed />;
  if (!info.data) return <ActivityIndicator />;
  return <WordQuizReady words={[...info.data.values()]} level={level} />;
}

function WordQuizReady({ words, level }: { words: WordPinyin[]; level: number }) {
  const [questions] = useState(() => wordCharacterQuestions(words));
  return <AudioQuiz questions={questions} record={{ kind: 'listening', ref: `word-${level}` }} />;
}
