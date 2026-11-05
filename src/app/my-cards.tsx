import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { SpeakButton } from '@/components/word-parts';
import { Radius, Spacing } from '@/constants/theme';
import { useAddCustomCard, useCustomCards, useDeleteCustomCard, type CustomCard } from '@/hooks/use-review';
import { useTheme } from '@/hooks/use-theme';
import { friendlyAuthError } from '@/lib/auth-helpers';
import { isHan } from '@/lib/sentences';
import { useAuth } from '@/providers/auth';

/** The learner's own flashcards: add (front / back / optional Chinese for audio), list, delete. */
export default function MyCardsScreen() {
  const { session } = useAuth();
  const cards = useCustomCards();

  return (
    <>
      <Stack.Screen options={{ title: 'My cards' }} />
      <Screen stacked>
        {!session ? (
          <Card title="Log in to make your own cards">
            <Button label="Log in" onPress={() => router.push('/sign-in')} />
          </Card>
        ) : (
          <>
            <AddCard />
            {cards.isPending ? (
              <ActivityIndicator />
            ) : cards.isError ? (
              <ThemedText themeColor="danger">Couldn&apos;t load your cards. Check your connection.</ThemedText>
            ) : cards.data.length ? (
              <>
                <ThemedText type="heading">
                  {cards.data.length} {cards.data.length === 1 ? 'card' : 'cards'}
                </ThemedText>
                <View role="list" style={styles.list}>
                  {cards.data.map((c) => (
                    <CardRow key={c.id} card={c} />
                  ))}
                </View>
              </>
            ) : null}
            <ThemedText type="small" themeColor="textSecondary">
              Tip: to review an example sentence, open a word page and tap &quot;Add to review&quot; under a sentence.
            </ThemedText>
          </>
        )}
      </Screen>
    </>
  );
}

function AddCard() {
  const add = useAddCustomCard();
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [zh, setZh] = useState('');
  const [added, setAdded] = useState(false);
  // Chinese on the front is used for audio unless the learner typed something else.
  const audio = zh.trim() || ([...front].some(isHan) ? front.trim() : '');
  const canSave = front.trim().length > 0 && back.trim().length > 0;

  async function save() {
    if (!canSave) return;
    setAdded(false);
    await add.mutateAsync({ front: front.trim(), back: back.trim(), zh: audio || null });
    setFront('');
    setBack('');
    setZh('');
    setAdded(true);
  }

  return (
    <Card title="New card">
      <TextField label="Front" value={front} onChangeText={setFront} maxLength={200} placeholder="e.g. 加油" />
      <TextField label="Back" value={back} onChangeText={setBack} maxLength={500} placeholder="e.g. jiā yóu — come on! you can do it!" />
      <TextField
        label="Chinese for audio (optional)"
        value={zh}
        onChangeText={setZh}
        maxLength={200}
        hint={!zh && audio ? `The front (${audio}) will be read aloud.` : undefined}
      />
      {add.isError ? (
        <ThemedText themeColor="danger" role="alert">
          Could not save: {friendlyAuthError(add.error)}
        </ThemedText>
      ) : null}
      {added ? (
        <ThemedText themeColor="success" role="status">
          Card added to your review.
        </ThemedText>
      ) : null}
      <Button label="Add card" onPress={save} disabled={!canSave} loading={add.isPending} />
    </Card>
  );
}

function CardRow({ card }: { card: CustomCard }) {
  const theme = useTheme();
  const remove = useDeleteCustomCard();
  const [confirming, setConfirming] = useState(false);
  return (
    <View role="listitem" style={[styles.row, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
      <View style={styles.rowTop}>
        <View style={styles.flex}>
          <ThemedText type="label">{card.front}</ThemedText>
          <ThemedText themeColor="textSecondary">{card.back}</ThemedText>
        </View>
        {card.zh ? <SpeakButton text={card.zh} label={`Play ${card.zh}`} size={36} /> : null}
      </View>
      {confirming ? (
        <View style={styles.actions}>
          <Button label="Delete card" variant="danger" loading={remove.isPending} onPress={() => remove.mutate(card.id)} style={styles.flex} />
          <Button label="Keep" variant="ghost" onPress={() => setConfirming(false)} style={styles.flex} />
        </View>
      ) : (
        <ThemedText type="link" role="button" aria-label={`Delete ${card.front}`} onPress={() => setConfirming(true)}>
          Delete
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  row: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three, gap: Spacing.two },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
});
