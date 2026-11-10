import { Stack, router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useProfile, useUpdateProfile } from '@/hooks/use-profile';
import { useInvalidateProgress, useLeaderboard } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth';

/** Opt-in weekly XP leaderboard (resets every Monday). Only learners who joined are shown. */
export default function LeaderboardScreen() {
  const { session } = useAuth();
  const profile = useProfile().data;
  const update = useUpdateProfile({ optimistic: false });
  const invalidate = useInvalidateProgress();
  const board = useLeaderboard();
  const joined = !!profile?.leaderboard_opt_in;

  const setJoined = (value: boolean) => update.mutate({ leaderboard_opt_in: value }, { onSuccess: () => invalidate() });

  return (
    <>
      <Stack.Screen options={{ title: 'Leaderboard' }} />
      <Screen stacked>
        {!session ? (
          <Card title="Log in to join the leaderboard">
            <Button label="Log in" onPress={() => router.push('/sign-in')} />
          </Card>
        ) : !profile ? (
          <ActivityIndicator />
        ) : (
          <>
            <Card title="Weekly leaderboard">
              <ThemedText themeColor="textSecondary">
                XP earned since Monday. It&apos;s off unless you join; other learners then see your display name, avatar
                and weekly XP — nothing else.
              </ThemedText>
              <Button
                label={update.isPending ? 'Saving…' : joined ? 'Leave the leaderboard' : 'Join the leaderboard'}
                variant={joined ? 'secondary' : 'primary'}
                disabled={update.isPending}
                onPress={() => setJoined(!joined)}
              />
              {update.isError ? (
                <ThemedText role="alert" themeColor="danger">
                  Couldn&apos;t save. Try again.
                </ThemedText>
              ) : null}
            </Card>
            {joined ? <Board rows={board.data} loading={board.isPending} error={board.isError} /> : null}
          </>
        )}
      </Screen>
    </>
  );
}

function Board({ rows, loading, error }: { rows?: ReturnType<typeof useLeaderboard>['data']; loading: boolean; error: boolean }) {
  const theme = useTheme();
  if (loading) return <ActivityIndicator />;
  if (error || !rows) return <ThemedText themeColor="danger">Couldn&apos;t load the leaderboard. Check your connection.</ThemedText>;
  if (!rows.length) return <ThemedText themeColor="textSecondary">Nobody has earned XP this week yet. Be the first!</ThemedText>;
  return (
    <View role="list" aria-label="This week's ranking" style={styles.list}>
      {rows.map((r) => (
        <View
          key={`${r.rank}-${r.display_name}-${r.is_me}`}
          role="listitem"
          aria-label={`${r.rank}. ${r.display_name}${r.is_me ? ' (you)' : ''}: ${r.xp} XP`}
          style={[styles.row, { borderColor: r.is_me ? theme.tint : theme.border, backgroundColor: r.is_me ? theme.backgroundSelected : theme.backgroundElement }]}>
          <ThemedText type="heading" style={styles.rank}>
            {r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}
          </ThemedText>
          <Avatar avatarUrl={r.avatar_url} name={r.display_name} size={36} />
          <ThemedText type="label" style={styles.flex}>
            {r.display_name}
            {r.is_me ? ' (you)' : ''}
          </ThemedText>
          <ThemedText type="smallBold">{r.xp} XP</ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: 1, borderRadius: Radius.medium, padding: Spacing.three },
  rank: { width: 32, textAlign: 'center' },
  flex: { flex: 1 },
});
