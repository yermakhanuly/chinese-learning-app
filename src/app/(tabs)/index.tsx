import { Link } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';

import { Card, ComingSoon } from '@/components/card';
import { DAILY_GOALS, LEARNING_GOALS, SELF_LEVELS, labelFor } from '@/constants/profile-options';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { hskLevelLabel, useHskLevelCounts } from '@/hooks/use-hsk-level-counts';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth';

export default function HomeScreen() {
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const name = profile?.display_name;

  return (
    <Screen title={name ? `你好, ${name}!` : '你好!'} subtitle="Nǐ hǎo! Welcome to HSK Chinese.">
      {session ? (
        profile ? (
          <Card title="Your plan">
            <ThemedText>
              <ThemedText type="smallBold">Goal: </ThemedText>
              {labelFor(LEARNING_GOALS, profile.learning_goal)} · <ThemedText type="smallBold">Level: </ThemedText>
              {labelFor(SELF_LEVELS, profile.self_level)}
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              Daily target: {labelFor(DAILY_GOALS, profile.daily_goal_minutes)} a day. Lessons arrive in Phase 3.
            </ThemedText>
          </Card>
        ) : null
      ) : (
        <Card title="Start learning">
          <ThemedText themeColor="textSecondary">
            Create a free account to set your goals and save your progress across iPhone and web.
          </ThemedText>
          <View style={styles.buttons}>
            <Link href="/sign-up" asChild>
              <Button label="Create account" onPress={() => {}} style={styles.flex} />
            </Link>
            <Link href="/sign-in" asChild>
              <Button label="Log in" variant="secondary" onPress={() => {}} style={styles.flex} />
            </Link>
          </View>
        </Card>
      )}
      <VocabularyCard />
      <ComingSoon phase={2} items={['Search the dictionary', 'Hear every word', 'Save words to study later']} />
    </Screen>
  );
}

function VocabularyCard() {
  const theme = useTheme();
  const { data, isPending, isError, refetch } = useHskLevelCounts();

  return (
    <Card title="HSK 3.0 vocabulary (2026 syllabus)">
      {isPending ? (
        <ActivityIndicator aria-label="Loading vocabulary" color={theme.tint} />
      ) : isError ? (
        <View style={styles.errorRow}>
          <ThemedText themeColor="danger">Could not reach the database.</ThemedText>
          <ThemedText type="link" role="button" onPress={() => refetch()}>
            Retry
          </ThemedText>
        </View>
      ) : (
        <>
          <ThemedText themeColor="textSecondary">
            {data.reduce((sum, l) => sum + l.count, 0).toLocaleString()} words ready to learn
          </ThemedText>
          <View style={styles.levels}>
            {data.map(({ level, count }) => (
              <View
                key={level}
                accessible
                aria-label={`${hskLevelLabel(level)}: ${count} words`}
                style={[styles.level, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <ThemedText type="smallBold" themeColor="tint">
                  {hskLevelLabel(level)}
                </ThemedText>
                <ThemedText type="label">{count.toLocaleString()}</ThemedText>
              </View>
            ))}
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  level: {
    minWidth: 96,
    flexGrow: 1,
    padding: Spacing.two + 2,
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.half,
  },
  buttons: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  flex: { flexGrow: 1, flexBasis: 140 },
  errorRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
});
