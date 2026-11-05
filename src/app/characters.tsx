import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CharacterChip } from '@/components/character/character-chip';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useCharacterList } from '@/hooks/use-characters';

const LEVELS = ['1', '2', '3', '4', '5', '6', '7'] as const;
type Level = (typeof LEVELS)[number];
const levelLabel = (l: Level) => (l === '7' ? '7–9' : l);

const startQuiz = (mode: 'recognition' | 'lookalike' | 'write', level: Level) =>
  router.push({ pathname: '/character-quiz', params: { mode, level } });

/** Characters hub: quizzes and the characters of each HSK level. */
export default function CharactersScreen() {
  const [level, setLevel] = useState<Level>('1');
  const list = useCharacterList(Number(level));

  return (
    <>
      <Stack.Screen options={{ title: 'Characters' }} />
      <Screen stacked>
        <Card title="Practice">
          <ThemedText themeColor="textSecondary">10 questions each. Pick a level below for the first and last.</ThemedText>
          <Button label={`Recognition quiz · HSK ${levelLabel(level)}`} onPress={() => startQuiz('recognition', level)} />
          <Button label="Look-alike drill" variant="secondary" onPress={() => startQuiz('lookalike', level)} />
          <Button label="Write from memory" variant="secondary" onPress={() => startQuiz('write', level)} />
          <ThemedText type="small" themeColor="textSecondary">
            Write from memory uses characters from words you&apos;ve learned (or HSK {levelLabel(level)} if you&apos;re
            new).
          </ThemedText>
        </Card>

        <SegmentedControl
          label="HSK level"
          options={LEVELS.map((l) => ({ value: l, label: levelLabel(l) }))}
          value={level}
          onChange={setLevel}
        />
        {list.isPending ? (
          <ActivityIndicator />
        ) : list.isError ? (
          <ThemedText themeColor="danger">Couldn&apos;t load the characters. Check your connection.</ThemedText>
        ) : (
          <>
            <ThemedText type="heading">
              HSK {levelLabel(level)}: {list.data.length} new characters
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Characters first used by words of this level, simplest first. Tap one to see its stroke order.
            </ThemedText>
            <View role="list" style={styles.grid}>
              {list.data.map((c) => (
                <View key={c.character} role="listitem">
                  <CharacterChip character={c.character} detail={c.pinyin[0]} />
                </View>
              ))}
            </View>
          </>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
