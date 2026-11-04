import { Stack, router } from 'expo-router';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { PinyinToggle } from '@/components/dictionary-controls';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { WordList } from '@/components/word-row';
import { Spacing } from '@/constants/theme';
import { useSavedWordDetails } from '@/hooks/use-dictionary';
import { useAuth } from '@/providers/auth';

/** Bookmarked words, newest first. They power word reviews in Phase 4. */
export default function SavedScreen() {
  const { session } = useAuth();
  const { saved, details } = useSavedWordDetails();
  const count = saved.data?.length ?? 0;

  return (
    <>
      <Stack.Screen options={{ title: 'Saved words', headerRight: () => <PinyinToggle /> }} />
      <Screen stacked>
        {!session ? (
          <Card title="Log in to save words">
            <ThemedText themeColor="textSecondary">Saved words sync between your iPhone and the website.</ThemedText>
            <Button label="Log in" onPress={() => router.push('/sign-in')} />
          </Card>
        ) : saved.isPending || (count > 0 && details.isPending) ? (
          <ActivityIndicator style={styles.loading} />
        ) : count === 0 ? (
          <Card title="No saved words yet">
            <ThemedText themeColor="textSecondary">Tap Save on any word page to keep it here.</ThemedText>
          </Card>
        ) : (
          <>
            <ThemedText themeColor="textSecondary">
              {count} {count === 1 ? 'word' : 'words'}
            </ThemedText>
            <WordList words={details.data ?? []} />
          </>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: Spacing.six },
});
