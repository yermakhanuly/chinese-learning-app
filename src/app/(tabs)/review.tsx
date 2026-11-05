import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { PressableLink } from '@/components/pressable-link';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useCourse } from '@/hooks/use-course';
import { useReviewSummary } from '@/hooks/use-review';
import { useTheme } from '@/hooks/use-theme';
import type { Deck } from '@/lib/srs';
import { useAuth } from '@/providers/auth';

const startReview = (deck: Deck) => router.push({ pathname: '/review-session', params: { deck } });

export default function ReviewScreen() {
  const { session } = useAuth();
  return (
    <Screen title="Review" subtitle="Flashcards that come back just before you forget">
      {!session ? (
        <Card title="Log in to review">
          <ThemedText themeColor="textSecondary">
            Words from the lessons you finish and the words you save come back here for review, scheduled by how well
            you remember them.
          </ThemedText>
          <Button label="Log in" onPress={() => router.push('/sign-in')} />
        </Card>
      ) : (
        <SignedIn />
      )}
    </Screen>
  );
}

function SignedIn() {
  const theme = useTheme();
  const summary = useReviewSummary();
  const course = useCourse(1);

  if (summary.isPending) return <ActivityIndicator color={theme.tint} />;
  if (summary.isError) {
    return (
      <Card>
        <ThemedText themeColor="danger">Couldn&apos;t load your reviews. Check your connection.</ThemedText>
        <Button label="Retry" variant="secondary" onPress={() => summary.refetch()} />
      </Card>
    );
  }
  const { due, new: fresh, total, weak } = summary.data;
  const today = due + fresh;

  return (
    <>
      <View style={[styles.today, { backgroundColor: theme.tint }]}>
        <ThemedText type="smallBold" style={{ color: theme.onTint }}>
          TODAY
        </ThemedText>
        <ThemedText type="subtitle" style={{ color: theme.onTint }}>
          {today ? `${today} ${today === 1 ? 'card' : 'cards'} to review` : total ? 'All caught up! 🎉' : 'No cards yet'}
        </ThemedText>
        <ThemedText style={{ color: theme.onTint }}>
          {total
            ? `${due} due · ${fresh} new · ${total} cards in total`
            : 'Finish a lesson or save words in the dictionary to start reviewing.'}
        </ThemedText>
        {today ? (
          <Button label="Start review" variant="secondary" onPress={() => startReview('all')} />
        ) : total ? null : (
          <Button label="Go to lessons" variant="secondary" onPress={() => router.push('/learn')} />
        )}
      </View>

      <Card title="Weak words">
        <ThemedText themeColor="textSecondary">
          {weak
            ? `${weak} ${weak === 1 ? 'word' : 'words'} you missed 3 or more times in the last 30 days.`
            : 'Words you miss 3 or more times show up here. None right now.'}
        </ThemedText>
        {weak ? <Button label="Practise weak words" onPress={() => startReview('weak')} /> : null}
        <Button label="Mistake notebook" variant="secondary" onPress={() => router.push('/mistakes')} />
      </Card>

      {total ? (
        <Card title="Decks">
          <ThemedText type="small" themeColor="textSecondary">
            Review only part of your cards. Each deck shows what is due today.
          </ThemedText>
          <View role="list" style={styles.decks}>
            <DeckRow deck="saved" title="Saved words" />
            <DeckRow deck="sentences" title="Sentences" />
            <DeckRow deck="custom" title="My cards" />
            <DeckRow deck="writing" title="Writing" />
            <DeckRow deck="level:1" title="HSK 1" />
            {course.data?.map((u) => (
              <DeckRow key={u.id} deck={`unit:${u.id}`} title={`Unit ${u.position}: ${u.title}`} />
            ))}
          </View>
        </Card>
      ) : null}

      <Card title="My cards">
        <ThemedText themeColor="textSecondary">
          Make your own flashcards, and add example sentences from any word page.
        </ThemedText>
        <Button label="Manage my cards" variant="secondary" onPress={() => router.push('/my-cards')} />
      </Card>
    </>
  );
}

function DeckRow({ deck, title }: { deck: Deck; title: string }) {
  const theme = useTheme();
  return (
    <View role="listitem">
      <PressableLink
        href={{ pathname: '/review-session', params: { deck } }}
        aria-label={`Review deck: ${title}`}
        style={({ pressed }) => [styles.deck, { borderColor: theme.border }, pressed && { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText style={styles.flex}>{title}</ThemedText>
        <ThemedText themeColor="textSecondary">›</ThemedText>
      </PressableLink>
    </View>
  );
}

const styles = StyleSheet.create({
  today: { borderRadius: Radius.large, padding: Spacing.four, gap: Spacing.two },
  decks: { gap: Spacing.one },
  deck: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two + 2,
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
});
