import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CloseButton } from '@/components/close-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useIsPremium } from '@/hooks/use-tutor';
import { useAuth } from '@/providers/auth';

const FEATURES = [
  ['🎭', 'Role-plays', 'Order food, see a doctor, check into a hotel, a job interview… with goals to reach.'],
  ['✎', 'Corrections', 'Every message you write or say is corrected, with a short explanation.'],
  ['🎤', 'Voice conversation', 'Hold to talk, and hear the reply in a natural voice.'],
  ['💬', 'Ask the tutor', 'Questions about words, grammar and characters, answered at your level.'],
  ['🧰', 'Sentence tools', 'Check your own sentences; break down sentences you don’t understand.'],
  ['✨', 'Made for you', 'Example sentences and quizzes from the words you are learning.'],
] as const;

/** What Premium adds. Payments arrive later (Phase 10); until then Premium is switched on by hand. */
export default function PremiumScreen() {
  const { session } = useAuth();
  const { premium, until } = useIsPremium();
  return (
    <Screen title="Premium" subtitle="Your personal AI Chinese tutor" modal topAction={<CloseButton />}>
      <View role="list" style={styles.list}>
        {FEATURES.map(([emoji, title, text]) => (
          <View key={title} role="listitem" style={styles.row}>
            <ThemedText style={styles.emoji}>{emoji}</ThemedText>
            <View style={styles.flex}>
              <ThemedText type="label">{title}</ThemedText>
              <ThemedText themeColor="textSecondary">{text}</ThemedText>
            </View>
          </View>
        ))}
      </View>
      {premium ? (
        <Card title="✓ You have Premium">
          <ThemedText themeColor="textSecondary">
            {until && until.getFullYear() < 2090 ? `Until ${until.toLocaleDateString()}.` : 'Enjoy your tutor!'}
          </ThemedText>
          <Button label="Open the AI tutor" onPress={() => router.replace('/tutor')} />
        </Card>
      ) : (
        <Card title="Subscriptions are coming soon">
          <ThemedText themeColor="textSecondary">
            Premium can&apos;t be bought in the app yet. Everything else in the app stays free.
          </ThemedText>
          {!session ? <Button label="Log in" variant="secondary" onPress={() => router.push('/sign-in')} /> : null}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  emoji: { fontSize: 26, lineHeight: 32, width: 34, textAlign: 'center' },
  flex: { flex: 1, gap: Spacing.half },
});
