import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PinyinToggle } from '@/components/dictionary-controls';
import { ThemedText } from '@/components/themed-text';
import { WordRow } from '@/components/word-row';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTopics, useWordList } from '@/hooks/use-dictionary';
import { HSK_LEVELS, hskLevelLabel } from '@/hooks/use-hsk-level-counts';
import { useHydrated } from '@/hooks/use-hydrated';
import { useTheme } from '@/hooks/use-theme';

/** Browse HSK words by level and/or topic: /words?level=3, /words?topic=food, or both. */
export default function WordsScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ level?: string; topic?: string }>();
  const level = params.level ? Number(params.level) : undefined;
  const topic = params.topic || undefined;
  const topics = useTopics();
  const topicName = topics.data?.find((t) => t.slug === topic)?.name;
  const list = useWordList({ level, topic });
  const words = list.data?.pages.flat() ?? [];
  const hydrated = useHydrated();

  const title = topic ? (topicName ?? 'Topic') : level ? hskLevelLabel(level) : 'All HSK words';

  return (
    <>
      <Stack.Screen options={{ title, headerRight: () => <PinyinToggle /> }} />
      <FlatList
        style={{ backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        data={words}
        keyExtractor={(w) => w.simplified}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <WordRow word={item} />
          </View>
        )}
        ListHeaderComponent={
          <View style={styles.item}>
            <ScrollView
              key={hydrated ? 'live' : 'static'}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}>
              <Filter label="All levels" active={!level} onPress={() => router.setParams({ level: '' })} />
              {HSK_LEVELS.map((l) => (
                <Filter
                  key={l}
                  label={hskLevelLabel(l)}
                  active={level === l}
                  onPress={() => router.setParams({ level: String(l) })}
                />
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.item}>
            {list.isPending ? (
              <ActivityIndicator style={styles.loading} />
            ) : (
              <ThemedText themeColor="textSecondary" style={styles.empty}>
                {list.isError ? "Couldn't load words. Check your connection." : 'No words here yet.'}
              </ThemedText>
            )}
          </View>
        }
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator style={styles.loading} /> : undefined}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
      />
    </>
  );
}

function Filter({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      role="radio"
      aria-checked={active}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filter,
        {
          backgroundColor: active ? theme.tint : theme.backgroundElement,
          borderColor: active ? theme.tint : theme.border,
        },
        pressed && { opacity: 0.7 },
      ]}>
      <ThemedText type="smallBold" style={{ color: active ? theme.onTint : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.three, gap: Spacing.two },
  // Rows fill the width (centered, capped on wide screens); FlatList cells size to their content otherwise.
  item: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.three },
  filters: { gap: Spacing.two, paddingBottom: Spacing.two },
  filter: {
    borderWidth: 1,
    borderRadius: Radius.large,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two - 2,
  },
  loading: { marginVertical: Spacing.four },
  empty: { textAlign: 'center', marginTop: Spacing.four },
});
