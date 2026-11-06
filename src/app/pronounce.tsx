import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CloseButton } from '@/components/close-button';
import { Screen } from '@/components/screen';
import { PronunciationPractice } from '@/components/speaking/pronunciation-practice';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useClips, useWordsInfo } from '@/hooks/use-audio';
import { useHydrated } from '@/hooks/use-hydrated';
import { shuffle } from '@/lib/character-quiz';

/**
 * /pronounce?text=你好 — practise one word or sentence;
 * /pronounce?level=1 — ten random words of an HSK level, one after another.
 */
export default function PronounceScreen() {
  const hydrated = useHydrated();
  const params = useLocalSearchParams<{ text?: string; meaning?: string; level?: string }>();
  const text = params.text?.trim().slice(0, 60);
  const level = /^[1-4]$/.test(params.level ?? '') ? Number(params.level) : null;
  return (
    <Screen title="Pronunciation" modal topAction={<CloseButton />}>
      {!hydrated ? (
        <ActivityIndicator />
      ) : text ? (
        <Single text={text} meaning={params.meaning} />
      ) : (
        <Series level={level ?? 1} />
      )}
    </Screen>
  );
}

function Single({ text, meaning }: { text: string; meaning?: string }) {
  const info = useWordsInfo([text]).data?.get(text);
  return <PronunciationPractice key={text} text={text} pinyin={info?.pinyin} meaning={meaning ?? info?.meanings.slice(0, 2).join('; ')} />;
}

function Series({ level }: { level: number }) {
  const clips = useClips('word', level);
  const words = useMemo(() => (clips.data ? shuffle(clips.data).slice(0, 10).map((c) => c.text) : []), [clips.data]);
  const info = useWordsInfo(words);
  const [index, setIndex] = useState(0);
  if (clips.isError || info.isError) return <ThemedText themeColor="danger">Couldn&apos;t load words. Check your connection.</ThemedText>;
  if (!info.data) return <ActivityIndicator />;
  const word = words[index];
  if (!word) return <ThemedText type="subtitle">Well done! You practised {words.length} words.</ThemedText>;
  const w = info.data.get(word);
  return (
    <View style={styles.gap}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        Word {index + 1} of {words.length} · HSK {level}
      </ThemedText>
      <PronunciationPractice key={word} text={word} pinyin={w?.pinyin} meaning={w?.meanings.slice(0, 2).join('; ')} />
      <Button label={index + 1 < words.length ? 'Next word' : 'Finish'} variant="secondary" onPress={() => setIndex((i) => i + 1)} />
    </View>
  );
}

const styles = StyleSheet.create({ gap: { gap: Spacing.three } });
