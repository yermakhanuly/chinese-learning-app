import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ReadingSettings, SearchField } from '@/components/dictionary-controls';
import { Screen } from '@/components/screen';
import { PressableLink } from '@/components/pressable-link';
import { ThemedText } from '@/components/themed-text';
import { WordList } from '@/components/word-row';
import { Radius, Spacing } from '@/constants/theme';
import { useDictionarySearch, useSavedWords, useTopics } from '@/hooks/use-dictionary';
import { hskLevelLabel, useHskLevelCounts } from '@/hooks/use-hsk-level-counts';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth';

export default function DictionaryScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const [input, setInput] = useState(params.q ?? '');
  const [query, setQuery] = useState(params.q ?? '');

  // Search shortly after typing stops; keep the query in the URL so it can be shared or reloaded.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(input);
      router.setParams({ q: input.trim() || undefined });
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  // A search started elsewhere (Home's search box) arrives as a new ?q=.
  const incoming = params.q ?? '';
  const [lastIncoming, setLastIncoming] = useState(incoming);
  if (incoming !== lastIncoming) {
    setLastIncoming(incoming);
    if (incoming !== input.trim()) {
      setInput(incoming);
      setQuery(incoming);
    }
  }

  const searching = query.trim().length > 0;

  return (
    <Screen title="Dictionary" subtitle="11,000+ HSK words and 125,000 dictionary entries">
      <SearchField
        value={input}
        onChangeText={setInput}
        onClear={() => {
          setInput('');
          setQuery('');
        }}
        onSubmitEditing={() => setQuery(input)}
      />
      {searching ? <SearchResults query={query} /> : <Browse />}
    </Screen>
  );
}

function SearchResults({ query }: { query: string }) {
  const results = useDictionarySearch(query);
  if (results.isPending) return <ActivityIndicator style={styles.loading} />;
  if (results.isError) {
    return <ThemedText themeColor="textSecondary">Search failed. Check your connection and try again.</ThemedText>;
  }
  if (!results.data.length) {
    return (
      <Card title={`No results for “${query.trim()}”`}>
        <ThemedText themeColor="textSecondary">
          Try characters (爱), pinyin with or without tones (ai, ài, ai4) or an English word (love).
        </ThemedText>
      </Card>
    );
  }
  return (
    <View style={[styles.results, results.isPlaceholderData && styles.stale]} aria-busy={results.isFetching}>
      <WordList words={results.data} />
    </View>
  );
}

function Browse() {
  const { session } = useAuth();
  const saved = useSavedWords();
  const levels = useHskLevelCounts();
  const topics = useTopics();
  const withWords = topics.data?.filter((t) => t.word_count > 0) ?? [];
  const savedCount = saved.data?.length ?? 0;

  return (
    <>
      <Tile
        href="/saved"
        title="Saved words"
        detail={!session ? 'Log in to save words' : savedCount ? `${savedCount} saved` : 'Nothing saved yet'}
        hanzi="收藏"
      />

      <View style={styles.section}>
        <ThemedText type="subtitle">By HSK level</ThemedText>
        <View style={styles.grid}>
          {(levels.data ?? []).map(({ level, count }) => (
            <Tile
              key={level}
              href={{ pathname: '/words', params: { level: String(level) } }}
              title={hskLevelLabel(level)}
              detail={`${count.toLocaleString('en-US')} words`}
              compact
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText type="subtitle">By topic</ThemedText>
        {topics.isPending ? (
          <ActivityIndicator />
        ) : withWords.length ? (
          <View style={styles.grid}>
            {withWords.map((t) => (
              <Tile
                key={t.slug}
                href={{ pathname: '/words', params: { topic: t.slug } }}
                title={t.name}
                detail={`${t.word_count.toLocaleString('en-US')} words`}
                hanzi={t.hanzi}
                compact
              />
            ))}
          </View>
        ) : (
          <ThemedText themeColor="textSecondary">Topics are being prepared.</ThemedText>
        )}
      </View>

      <ReadingSettings />
    </>
  );
}

function Tile({
  href,
  title,
  detail,
  hanzi,
  compact,
}: {
  href: Href;
  title: string;
  detail: string;
  hanzi?: string;
  compact?: boolean;
}) {
  const theme = useTheme();
  return (
    <PressableLink
      href={href}
      aria-label={`${title}, ${detail}`}
      style={({ pressed }) => [
        styles.tile,
        compact && styles.compact,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, borderColor: theme.border },
      ]}>
      {hanzi ? (
        <ThemedText type="hanzi" themeColor="tint" style={styles.tileHanzi}>
          {hanzi}
        </ThemedText>
      ) : null}
      <View style={styles.tileText}>
        <ThemedText type="label" numberOfLines={2}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
    </PressableLink>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: Spacing.four },
  results: { gap: Spacing.two },
  stale: { opacity: 0.6 },
  section: { gap: Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
  },
  compact: { flexGrow: 1, flexBasis: 150 },
  tileHanzi: { fontSize: 24, lineHeight: 32 },
  tileText: { flex: 1, gap: Spacing.half },
});
