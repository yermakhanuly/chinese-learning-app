import { Stack, router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { PinyinToggle } from '@/components/dictionary-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { WordRow } from '@/components/word-row';
import { Radius, Spacing } from '@/constants/theme';
import { useMistakeNotebook, type NotebookEntry } from '@/hooks/use-review';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth';

/** Every word missed in a lesson or marked "Again" in review; weak words (3+ misses in 30 days) first. */
export default function MistakesScreen() {
  const { session } = useAuth();
  const notebook = useMistakeNotebook();
  const entries = notebook.data ?? [];
  const weak = entries.filter((e) => e.weak);
  const others = entries.filter((e) => !e.weak);

  return (
    <>
      <Stack.Screen options={{ title: 'Mistake notebook', headerRight: () => <PinyinToggle /> }} />
      <Screen stacked>
        {!session ? (
          <Card title="Log in to keep a mistake notebook">
            <Button label="Log in" onPress={() => router.push('/sign-in')} />
          </Card>
        ) : notebook.isPending ? (
          <ActivityIndicator style={styles.loading} />
        ) : notebook.isError ? (
          <Card>
            <ThemedText themeColor="danger">Couldn&apos;t load your notebook. Check your connection.</ThemedText>
            <Button label="Retry" variant="secondary" onPress={() => notebook.refetch()} />
          </Card>
        ) : !entries.length ? (
          <Card title="No mistakes yet">
            <ThemedText themeColor="textSecondary">
              Words you get wrong in lessons, or mark &quot;Again&quot; in review, are collected here.
            </ThemedText>
          </Card>
        ) : (
          <>
            {weak.length ? (
              <>
                <ThemedText type="heading">Weak words</ThemedText>
                <ThemedText themeColor="textSecondary">Missed 3 or more times in the last 30 days.</ThemedText>
                <Button
                  label="Practise weak words"
                  onPress={() => router.push({ pathname: '/review-session', params: { deck: 'weak' } })}
                />
                <EntryList entries={weak} />
              </>
            ) : null}
            {others.length ? (
              <>
                <ThemedText type="heading">{weak.length ? 'Other mistakes' : 'Recent mistakes'}</ThemedText>
                <EntryList entries={others} />
              </>
            ) : null}
          </>
        )}
      </Screen>
    </>
  );
}

function EntryList({ entries }: { entries: NotebookEntry[] }) {
  return (
    <View role="list" style={styles.list}>
      {entries.map((e) => (
        <View key={e.word} role="listitem">
          <WordRow
            word={{ ...e.content, hsk_level: null, source: 'hsk' }}
            extraLabel={`missed ${e.misses} ${e.misses === 1 ? 'time' : 'times'}${e.weak ? ', weak word' : ''}`}
            trailing={<MissBadge entry={e} />}
          />
        </View>
      ))}
    </View>
  );
}

function MissBadge({ entry }: { entry: NotebookEntry }) {
  const theme = useTheme();
  return (
    <View style={[styles.badge, { borderColor: entry.weak ? theme.danger : theme.border }]}>
      <ThemedText type="smallBold" themeColor={entry.weak ? 'danger' : 'textSecondary'}>
        ✕{entry.misses}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: Spacing.six },
  list: { gap: Spacing.two },
  badge: { borderWidth: 1, borderRadius: Radius.small, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
});
