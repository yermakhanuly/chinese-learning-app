import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ActivityCalendar, Bar, BadgeGrid, ChallengeList, LinkRow, SkillBars, StatTile } from '@/components/progress/progress-parts';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useGrammarList } from '@/hooks/use-grammar';
import { useHskLevelCounts } from '@/hooks/use-hsk-level-counts';
import { useProgressSummary, useRecentActivity, type ActivityRow, type DayActivity } from '@/hooks/use-progress';
import { PASS_MARK } from '@/lib/mock-test';
import { XP_RULES, addDays, formatDuration, readiness, weekStart, type Stats } from '@/lib/progress';
import { useAuth } from '@/providers/auth';

/** Progress dashboard: level, streak, calendar, weekly report, challenges, skills, readiness, badges. */
export default function ProgressScreen() {
  const { session } = useAuth();
  const p = useProgressSummary();
  return (
    <>
      <Stack.Screen options={{ title: 'Progress' }} />
      <Screen stacked>
        {!session ? (
          <Card title="Log in to track your progress">
            <ThemedText themeColor="textSecondary">XP, streaks, badges and your activity are saved in your account.</ThemedText>
            <Button label="Log in" onPress={() => router.push('/sign-in')} />
          </Card>
        ) : !p.ready ? (
          p.isError ? (
            <ThemedText themeColor="danger">Couldn&apos;t load your progress. Check your connection.</ThemedText>
          ) : (
            <ActivityIndicator style={styles.loading} />
          )
        ) : (
          <Dashboard p={p} />
        )}
      </Screen>
    </>
  );
}

type Summary = Extract<ReturnType<typeof useProgressSummary>, { ready: true }>;

function Dashboard({ p }: { p: Summary }) {
  const [rules, setRules] = useState(false);
  const { level, streak, stats, goal } = p;
  return (
    <View style={styles.gap}>
      <Card>
        <ThemedText type="title">Level {level.level}</ThemedText>
        <Bar value={level.fraction} label={`Level ${level.level} progress`} height={12} />
        <ThemedText themeColor="textSecondary">
          {level.xpInLevel} / {level.xpForLevel} XP to level {level.level + 1} · {stats.total_xp} XP in total
        </ThemedText>
        <ThemedText type="link" role="button" aria-expanded={rules} onPress={() => setRules((r) => !r)}>
          {rules ? 'Hide' : 'How do I earn XP?'}
        </ThemedText>
        {rules
          ? XP_RULES.map((r) => (
              <View key={r.what} style={styles.row}>
                <ThemedText style={styles.flex}>{r.what}</ThemedText>
                <ThemedText type="smallBold">{r.xp} XP</ThemedText>
              </View>
            ))
          : null}
      </Card>

      <View style={styles.tiles}>
        <StatTile value={`🔥 ${streak.current}`} label="day streak" detail={`best ${streak.best}`} />
        <StatTile value={`${streak.todayXp}/${goal}`} label="XP today" detail={streak.todayMet ? 'goal reached ✓' : `${goal - streak.todayXp} to go`} />
        <StatTile value={streak.freezeLeft ? '❄️ 1' : '❄️ 0'} label="streak freeze" detail={streak.freezeLeft ? 'ready this week' : 'used this week'} />
      </View>

      <Card title="Activity">
        <ActivityCalendar days={p.days} today={p.today} goal={goal} />
      </Card>

      <WeeklyReport days={p.days} today={p.today} />

      <Card>
        <ChallengeList title="Today's challenges" items={p.daily} />
        <ChallengeList title="This week" items={p.weekly} />
      </Card>

      <View style={styles.tiles}>
        <StatTile value={String(stats.words_learned)} label="words learned" detail={`${stats.words_mastered} mastered`} />
        <StatTile value={formatDuration(stats.total_seconds)} label="study time" detail="estimated" />
        <StatTile value={String(stats.lessons)} label="lessons done" detail={`${stats.perfect_lessons} perfect`} />
        <StatTile value={String(stats.reviews)} label="cards reviewed" detail={stats.review_accuracy === null ? undefined : `${stats.review_accuracy}% right (30 days)`} />
      </View>

      <Card title="Skills">
        <SkillBars stats={stats} />
      </Card>

      <Readiness stats={stats} />

      <Card>
        <BadgeGrid badges={p.badges} />
      </Card>

      <LinkRow label="Weekly leaderboard" detail="Opt in" onPress={() => router.push('/leaderboard')} />

      <History />
    </View>
  );
}

function sumRange(days: DayActivity[], from: string, to: string) {
  const inRange = days.filter((d) => d.day >= from && d.day <= to);
  return {
    xp: inRange.reduce((n, d) => n + d.xp, 0),
    seconds: inRange.reduce((n, d) => n + d.seconds, 0),
    active: inRange.filter((d) => d.xp > 0).length,
  };
}

/** This week against last week. */
function WeeklyReport({ days, today }: { days: DayActivity[]; today: string }) {
  const start = weekStart(today);
  const now = sumRange(days, start, today);
  const before = sumRange(days, addDays(start, -7), addDays(start, -1));
  const change = before.xp ? Math.round(((now.xp - before.xp) / before.xp) * 100) : null;
  return (
    <Card title="This week">
      <View style={styles.tiles}>
        <StatTile value={`${now.xp}`} label="XP" detail={`last week ${before.xp}`} />
        <StatTile value={`${now.active}/7`} label="days studied" detail={`last week ${before.active}`} />
        <StatTile value={formatDuration(now.seconds)} label="study time" detail={`last week ${formatDuration(before.seconds)}`} />
      </View>
      {change !== null ? (
        <ThemedText themeColor="textSecondary">
          {change >= 0 ? `▲ ${change}% more XP than last week.` : `▼ ${-change}% less XP than last week.`}
        </ThemedText>
      ) : null}
    </Card>
  );
}

function Readiness({ stats }: { stats: Stats }) {
  const counts = useHskLevelCounts().data;
  const grammar = useGrammarList().data;
  if (!counts || !grammar) return null;
  return (
    <Card title="HSK readiness">
      <ThemedText type="small" themeColor="textSecondary">
        From the level&apos;s words you&apos;ve learned, grammar practised, review accuracy and your best mock test.
      </ThemedText>
      {[1, 2].map((lv) => {
        const r = readiness(
          lv,
          stats,
          counts.find((c) => c.level === lv)?.count ?? 0,
          grammar.filter((g) => g.hsk_level === lv).length,
        );
        const best = stats.mock_best[`hsk${lv}`];
        return (
          <View key={lv} style={styles.readiness}>
            <View style={styles.row}>
              <ThemedText type="heading" style={styles.flex}>
                HSK {lv}
              </ThemedText>
              <ThemedText type="subtitle">{r.percent}%</ThemedText>
            </View>
            <Bar value={r.percent / 100} label={`HSK ${lv} readiness`} height={12} />
            {r.parts.map((part) => (
              <ThemedText key={part.label} type="small" themeColor="textSecondary">
                {part.label}: {part.percent}%
              </ThemedText>
            ))}
            <ThemedText type="small" themeColor="textSecondary">
              {best === undefined
                ? 'No mock test yet.'
                : `Best mock test: ${best} / 200 (${best >= PASS_MARK ? 'pass' : `pass mark ${PASS_MARK}`})`}
            </ThemedText>
            <Button label={`Take mock HSK ${lv}`} variant="secondary" onPress={() => router.push({ pathname: '/mock-test', params: { level: String(lv) } })} />
          </View>
        );
      })}
    </Card>
  );
}

const KIND_LABEL: Record<string, string> = {
  lesson: '📘 Lesson',
  review: '🔁 Review',
  grammar: '🧩 Grammar',
  reading: '📖 Reading',
  listening: '🎧 Listening quiz',
  tones: '🎵 Tone quiz',
  characters: '✍️ Character quiz',
  pronunciation: '🎤 Pronunciation',
  mock: '📝 Mock HSK test',
};

/** Recent activity, with repeated reviews grouped into one line. */
function History() {
  const recent = useRecentActivity(40).data;
  if (!recent?.length) return null;
  const rows: (ActivityRow & { count: number })[] = [];
  for (const a of recent) {
    const last = rows[rows.length - 1];
    if (last && last.kind === 'review' && a.kind === 'review' && last.created_at.slice(0, 10) === a.created_at.slice(0, 10)) {
      last.count++;
      last.xp += a.xp;
    } else rows.push({ ...a, count: 1 });
  }
  return (
    <Card title="History">
      <View role="list" style={styles.gapSmall}>
        {rows.slice(0, 15).map((a, i) => (
          <View key={i} role="listitem" style={styles.row}>
            <ThemedText style={styles.flex}>
              {KIND_LABEL[a.kind] ?? a.kind}
              {a.count > 1 ? ` × ${a.count}` : ''}
              {a.kind !== 'review' && a.total ? ` · ${a.kind === 'mock' ? `${a.correct}/200` : a.total === 100 ? `${a.correct}%` : `${a.correct}/${a.total}`}` : ''}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              +{a.xp} XP · {new Date(a.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </ThemedText>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: Spacing.six },
  gap: { gap: Spacing.three },
  gapSmall: { gap: Spacing.two },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  readiness: { gap: Spacing.one, paddingTop: Spacing.two },
});
