import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CloseButton } from '@/components/close-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatPrice, useBillingPortal, useCheckout, usePlans, usePremiumState, type PremiumState } from '@/hooks/use-billing';
import { useHydrated } from '@/hooks/use-hydrated';
import { useAuth } from '@/providers/auth';

const FEATURES = [
  ['🎭', 'Role-plays', 'Order food, see a doctor, check into a hotel, a job interview… with goals to reach.'],
  ['✎', 'Corrections', 'Every message you write or say is corrected, with a short explanation.'],
  ['🎤', 'Voice conversation', 'Hold to talk, and hear the reply in a natural voice.'],
  ['💬', 'Ask the tutor', 'Questions about words, grammar and characters, answered at your level.'],
  ['🧰', 'Sentence tools', 'Check your own sentences; break down sentences you don’t understand.'],
  ['✨', 'Made for you', 'Example sentences and quizzes from the words you are learning.'],
] as const;

const STATUS: Record<string, string> = {
  trialing: 'Free trial',
  active: 'Active',
  past_due: 'Payment due: update your card',
  canceled: 'Cancelled',
  unpaid: 'Unpaid',
  incomplete: 'Not finished',
  incomplete_expired: 'Not finished',
  paused: 'Paused',
};

const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : '');

/** What Premium adds, and subscribing (Stripe, on the web). */
export default function PremiumScreen() {
  const hydrated = useHydrated();
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();
  const back = hydrated ? checkout : undefined;
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
      <Status returned={back} />
    </Screen>
  );
}

function Status({ returned }: { returned?: string }) {
  const { session } = useAuth();
  // Coming back from Stripe: the webhook switches Premium on within seconds, so keep asking.
  const state = usePremiumState(returned === 'success');
  if (!session) {
    return (
      <Card title="Log in to get Premium">
        <Button label="Log in" onPress={() => router.push('/sign-in')} />
      </Card>
    );
  }
  if (state.isPending) return <ActivityIndicator />;
  const s = state.data;
  return (
    <>
      {returned === 'cancelled' ? (
        <ThemedText role="status" themeColor="textSecondary">
          No payment was made.
        </ThemedText>
      ) : null}
      {s?.premium ? (
        <Active s={s} />
      ) : returned === 'success' ? (
        <Card title="Thank you!">
          <View style={styles.row}>
            <ActivityIndicator />
            <ThemedText themeColor="textSecondary" role="status">
              Switching Premium on…
            </ThemedText>
          </View>
        </Card>
      ) : (
        <Plans s={s} />
      )}
    </>
  );
}

function Active({ s }: { s: PremiumState }) {
  const portal = useBillingPortal();
  const sub = s.subscription && ['trialing', 'active', 'past_due'].includes(s.subscription.status) ? s.subscription : null;
  const manual = s.manual_until && new Date(s.manual_until) > new Date() ? s.manual_until : null;
  return (
    <Card title="✓ You have Premium">
      {sub ? (
        <ThemedText themeColor="textSecondary">
          {sub.plan === 'yearly' ? 'Yearly' : 'Monthly'} plan · {STATUS[sub.status] ?? sub.status}
          {sub.status === 'trialing' && sub.trial_end ? ` until ${date(sub.trial_end)}` : ''}
          {sub.cancel_at_period_end ? ` · ends ${date(sub.current_period_end)}` : sub.current_period_end ? ` · renews ${date(sub.current_period_end)}` : ''}
        </ThemedText>
      ) : manual ? (
        <ThemedText themeColor="textSecondary">{new Date(manual).getFullYear() < 2090 ? `Until ${date(manual)}.` : 'Enjoy your tutor!'}</ThemedText>
      ) : null}
      <Button label="Open the AI tutor" onPress={() => router.replace('/tutor')} />
      {sub && process.env.EXPO_OS === 'web' ? (
        <Button label="Manage or cancel" variant="secondary" loading={portal.isPending} onPress={() => portal.mutate()} />
      ) : null}
      {portal.isError ? (
        <ThemedText role="alert" themeColor="danger">
          {portal.error.message}
        </ThemedText>
      ) : null}
    </Card>
  );
}

function Plans({ s }: { s?: PremiumState }) {
  const plans = usePlans();
  const checkout = useCheckout();
  if (process.env.EXPO_OS !== 'web') {
    return (
      <Card title="Subscribe on the web">
        <ThemedText themeColor="textSecondary">
          Open the app in a browser and log in to subscribe. Premium then works on your iPhone too.
        </ThemedText>
      </Card>
    );
  }
  if (plans.isPending) return <ActivityIndicator />;
  if (plans.isError || !plans.data.plans.length) {
    return (
      <Card title="Subscriptions are coming soon">
        <ThemedText themeColor="textSecondary">Premium can&apos;t be bought yet. Everything else in the app stays free.</ThemedText>
      </Card>
    );
  }
  const trial = !s?.subscription?.trial_end && !['canceled', 'unpaid'].includes(s?.subscription?.status ?? '');
  const monthly = plans.data.plans.find((p) => p.plan === 'monthly');
  const yearly = plans.data.plans.find((p) => p.plan === 'yearly');
  const saving = monthly?.amount && yearly?.amount ? Math.round(100 - (yearly.amount / (monthly.amount * 12)) * 100) : 0;
  return (
    <Card title={trial ? `Try it free for ${plans.data.trial_days} days` : 'Choose a plan'}>
      <ThemedText themeColor="textSecondary">
        {trial ? 'You won’t be charged before the trial ends, and you can cancel any time. ' : 'Cancel any time. '}
        Payments are handled by Stripe.
      </ThemedText>
      {[yearly, monthly].map((p) =>
        p ? (
          <Button
            key={p.plan}
            label={`${p.plan === 'yearly' ? 'Yearly' : 'Monthly'} · ${formatPrice(p)}${p.plan === 'yearly' && saving > 0 ? ` (save ${saving}%)` : ''}`}
            variant={p.plan === 'yearly' ? 'primary' : 'secondary'}
            loading={checkout.isPending && checkout.variables === p.plan}
            disabled={checkout.isPending}
            onPress={() => checkout.mutate(p.plan)}
          />
        ) : null,
      )}
      {checkout.isError ? (
        <ThemedText role="alert" themeColor="danger">
          {checkout.error.message}
        </ThemedText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  emoji: { fontSize: 26, lineHeight: 32, width: 34, textAlign: 'center' },
  flex: { flex: 1, gap: Spacing.half },
});
