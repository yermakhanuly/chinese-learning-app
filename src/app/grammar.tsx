import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { SearchField } from '@/components/dictionary-controls';
import { PressableLink } from '@/components/pressable-link';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { GRAMMAR_TOPICS } from '@/constants/grammar-topics';
import { Radius, Spacing } from '@/constants/theme';
import { useGrammarList, useGrammarProgress, type GrammarSummary } from '@/hooks/use-grammar';
import { useTheme } from '@/hooks/use-theme';
import { filterGrammar } from '@/lib/grammar-search';

type Level = 'all' | '1' | '2';

/** The grammar library: every HSK 1–2 point, searchable, by level and topic. */
export default function GrammarScreen() {
  const theme = useTheme();
  const list = useGrammarList();
  const progress = useGrammarProgress().data;
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<Level>('all');
  const [topic, setTopic] = useState<string | null>(null);

  const shown = useMemo(
    () => filterGrammar(list.data ?? [], { query, level: level === 'all' ? null : Number(level), topic }),
    [list.data, query, level, topic],
  );
  const practised = progress ? (list.data ?? []).filter((g) => progress.has(g.id)).length : 0;

  return (
    <>
      <Stack.Screen options={{ title: 'Grammar' }} />
      <Screen stacked>
        <SearchField
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
          aria-label="Search grammar"
          placeholder="了, questions, measure words…"
        />
        <SegmentedControl
          label="HSK level"
          options={[
            { value: 'all', label: 'All' },
            { value: '1', label: 'HSK 1' },
            { value: '2', label: 'HSK 2' },
          ]}
          value={level}
          onChange={setLevel}
        />
        <View role="radiogroup" aria-label="Topic" style={styles.chips}>
          {[{ slug: null, name: 'All topics' }, ...GRAMMAR_TOPICS].map((t) => {
            const selected = topic === t.slug;
            return (
              <Pressable
                key={t.slug ?? 'all'}
                role="radio"
                aria-checked={selected}
                onPress={() => setTopic(t.slug)}
                style={[
                  styles.chip,
                  { borderColor: selected ? theme.tint : theme.border, backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement },
                ]}>
                <ThemedText type="small" themeColor={selected ? 'tint' : 'text'}>
                  {t.name}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {list.isPending ? (
          <ActivityIndicator />
        ) : list.isError ? (
          <ThemedText themeColor="danger">Couldn&apos;t load the grammar library. Check your connection.</ThemedText>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary" role="status">
              {shown.length === list.data.length
                ? `${list.data.length} grammar points${progress ? ` · ${practised} practised` : ''}`
                : `${shown.length} of ${list.data.length} grammar points`}
            </ThemedText>
            {shown.length ? (
              <View role="list" style={styles.list}>
                {shown.map((g) => (
                  <GrammarRow key={g.id} point={g} score={progress?.get(g.id)} />
                ))}
              </View>
            ) : (
              <ThemedText themeColor="textSecondary">No grammar points match. Try another word or topic.</ThemedText>
            )}
          </>
        )}
      </Screen>
    </>
  );
}

function GrammarRow({ point, score }: { point: GrammarSummary; score?: number }) {
  const theme = useTheme();
  return (
    <View role="listitem">
      <PressableLink
        href={{ pathname: '/grammar-point', params: { id: point.id } }}
        aria-label={`${point.title}, HSK ${point.hsk_level}${score !== undefined ? `, practised ${score}%` : ''}`}
        style={({ pressed }) => [styles.row, { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement }]}>
        <View style={styles.flex}>
          <ThemedText type="label">{point.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {point.summary}
          </ThemedText>
        </View>
        <View style={styles.meta}>
          <ThemedText type="small" themeColor="textSecondary">
            HSK {point.hsk_level}
          </ThemedText>
          {score !== undefined ? (
            <ThemedText type="smallBold" themeColor={score >= 80 ? 'success' : 'warning'}>
              ✓ {score}%
            </ThemedText>
          ) : null}
        </View>
      </PressableLink>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: Radius.small * 4, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  list: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.medium,
    padding: Spacing.three,
  },
  meta: { alignItems: 'flex-end', gap: Spacing.one },
});
