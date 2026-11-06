import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { PressableLink } from '@/components/pressable-link';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useReadingList, useReadingProgress, type ReadingSummary } from '@/hooks/use-grammar';
import { useTheme } from '@/hooks/use-theme';

type Level = '1' | '2';

/** Graded reading: stories and dialogues per HSK level. */
export default function ReadingScreen() {
  const [level, setLevel] = useState<Level>('1');
  const list = useReadingList();
  const progress = useReadingProgress().data;
  const texts = (list.data ?? []).filter((t) => t.hsk_level === Number(level));
  const read = texts.filter((t) => progress?.has(t.id)).length;

  return (
    <>
      <Stack.Screen options={{ title: 'Reading' }} />
      <Screen stacked>
        <ThemedText themeColor="textSecondary">
          Short stories and dialogues that use only words of your level. Tap any word for its meaning, listen with
          natural voices, then check your understanding.
        </ThemedText>
        <SegmentedControl
          label="HSK level"
          options={[
            { value: '1', label: 'HSK 1' },
            { value: '2', label: 'HSK 2' },
          ]}
          value={level}
          onChange={setLevel}
        />
        {list.isPending ? (
          <ActivityIndicator />
        ) : list.isError ? (
          <ThemedText themeColor="danger">Couldn&apos;t load the texts. Check your connection.</ThemedText>
        ) : (
          <>
            {progress ? (
              <ThemedText type="small" themeColor="textSecondary" role="status">
                {read} of {texts.length} read
              </ThemedText>
            ) : null}
            <View role="list" style={styles.list}>
              {texts.map((t) => (
                <ReadingRow key={t.id} text={t} score={progress?.get(t.id)} />
              ))}
            </View>
          </>
        )}
      </Screen>
    </>
  );
}

function ReadingRow({ text, score }: { text: ReadingSummary; score?: number }) {
  const theme = useTheme();
  return (
    <View role="listitem">
      <PressableLink
        href={{ pathname: '/reading-text', params: { id: text.id } }}
        aria-label={`${text.title}, ${text.kind}${score !== undefined ? `, read, ${score}%` : ''}`}
        style={({ pressed }) => [styles.row, { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement }]}>
        <ThemedText style={styles.icon}>{text.kind === 'dialogue' ? '💬' : '📖'}</ThemedText>
        <View style={styles.flex}>
          <ThemedText type="label">
            <ThemedText lang="zh" type="label">
              {text.title_zh}
            </ThemedText>{' '}
            · {text.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {text.summary}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {text.kind === 'dialogue' ? 'Dialogue' : 'Story'} · {text.char_count} characters
          </ThemedText>
        </View>
        {score !== undefined ? (
          <ThemedText type="smallBold" themeColor={score >= 80 ? 'success' : 'warning'}>
            ✓ {score}%
          </ThemedText>
        ) : null}
      </PressableLink>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three },
  icon: { fontSize: 24, lineHeight: 32 },
});
