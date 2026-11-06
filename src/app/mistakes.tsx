import { Stack, router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { PinyinToggle } from '@/components/dictionary-controls';
import { PressableLink } from '@/components/pressable-link';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { WordRow } from '@/components/word-row';
import { Radius, Spacing } from '@/constants/theme';
import { useGrammarMistakes, type GrammarMistake } from '@/hooks/use-grammar';
import { useMistakeNotebook, type NotebookEntry } from '@/hooks/use-review';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth';

/** Every word missed in a lesson or marked "Again" in review; weak words (3+ misses in 30 days) first. */
export default function MistakesScreen() {
  const { session } = useAuth();
  const notebook = useMistakeNotebook();
  const grammar = useGrammarMistakes().data ?? [];
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
        ) : !entries.length && !grammar.length ? (
          <Card title="No mistakes yet">
            <ThemedText themeColor="textSecondary">
              Words you get wrong in lessons, grammar exercises you miss, and cards you mark &quot;Again&quot; in review are
              collected here.
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
            {grammar.length ? <GrammarMistakes items={grammar} /> : null}
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

function GrammarMistakes({ items }: { items: GrammarMistake[] }) {
  const theme = useTheme();
  return (
    <>
      <ThemedText type="heading">Grammar</ThemedText>
      <View role="list" style={styles.list}>
        {items.map((g) => (
          <View key={g.grammar_id} role="listitem" style={[styles.grammar, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <PressableLink href={{ pathname: '/grammar-point', params: { id: g.grammar_id } }}>
              <ThemedText type="link">{g.title}</ThemedText>
            </PressableLink>
            <ThemedText type="small" themeColor="textSecondary">
              HSK {g.hsk_level} · missed {g.misses} {g.misses === 1 ? 'time' : 'times'}
            </ThemedText>
            {g.exercises?.length ? (
              <Button
                label={`Practise the ${g.exercises.length} missed ${g.exercises.length === 1 ? 'exercise' : 'exercises'}`}
                variant="secondary"
                onPress={() => router.push({ pathname: '/grammar-practice', params: { id: g.grammar_id, only: g.exercises!.join(',') } })}
              />
            ) : null}
          </View>
        ))}
      </View>
    </>
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
  grammar: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three, gap: Spacing.two },
  badge: { borderWidth: 1, borderRadius: Radius.small, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
});
