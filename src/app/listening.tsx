import { Stack, router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';

const LEVELS = ['1', '2', '3', '4'] as const;
type Level = (typeof LEVELS)[number];

/** Listening & speaking hub: tones, listening quizzes, pronunciation practice. */
export default function ListeningScreen() {
  const [level, setLevel] = useState<Level>('1');
  return (
    <>
      <Stack.Screen options={{ title: 'Listening & speaking' }} />
      <Screen stacked>
        <Card title="Tones">
          <ThemedText themeColor="textSecondary">The four tones, tone pairs and tone changes, with audio.</ThemedText>
          <Button label="Tone trainer" onPress={() => router.push('/tones')} />
          <Button label="Tone quiz: syllables" variant="secondary" onPress={() => router.push({ pathname: '/tone-quiz', params: { mode: 'syllable' } })} />
          <Button label="Tone quiz: words" variant="secondary" onPress={() => router.push({ pathname: '/tone-quiz', params: { mode: 'word' } })} />
        </Card>

        <SegmentedControl label="HSK level" options={LEVELS.map((l) => ({ value: l, label: `HSK ${l}` }))} value={level} onChange={setLevel} />

        <Card title="Listening">
          <ThemedText themeColor="textSecondary">Hear natural voices, then choose what you heard.</ThemedText>
          <Button
            label={`Sentences · HSK ${level}`}
            onPress={() => router.push({ pathname: '/listening-quiz', params: { mode: 'sentence', level } })}
          />
          <Button
            label={`Words · HSK ${level}`}
            variant="secondary"
            onPress={() => router.push({ pathname: '/listening-quiz', params: { mode: 'word', level } })}
          />
        </Card>

        <Card title="Pronunciation">
          <ThemedText themeColor="textSecondary">
            Record yourself and get a score for every syllable, with your pitch drawn over the model voice. You can
            also practise any word from its dictionary page.
          </ThemedText>
          <Button label={`Practise 10 words · HSK ${level}`} onPress={() => router.push({ pathname: '/pronounce', params: { level } })} />
        </Card>
        <ThemedText type="small" themeColor="textSecondary">
          Audio speed can be changed in Profile → Reading and audio.
        </ThemedText>
      </Screen>
    </>
  );
}
