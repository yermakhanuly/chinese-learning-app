import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useProgressSummary, type DayActivity } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { calendarWeeks, intensity, type Badge, type Challenge, type Stats } from '@/lib/progress';

/** A labelled 0–1 bar (role progressbar). One hue: the fill is the tint, the track is recessive. */
export function Bar({ value, label, height = 10 }: { value: number; label: string; height?: number }) {
  const theme = useTheme();
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <View
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      style={[styles.track, { height, backgroundColor: theme.backgroundSelected }]}>
      {pct > 0 ? <View style={[styles.fill, { width: `${pct}%`, backgroundColor: theme.tint }]} /> : null}
    </View>
  );
}

/** A big number with a label underneath. */
export function StatTile({ value, label, detail }: { value: string; label: string; detail?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.tile, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]} aria-label={`${label}: ${value}${detail ? `, ${detail}` : ''}`}>
      <ThemedText style={styles.tileValue}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {detail ? (
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** Home: streak, today's XP against the goal, level, and a link to the dashboard. */
export function ProgressSummaryCard() {
  const p = useProgressSummary();
  if (!p.ready) return null;
  const { streak, goal, level } = p;
  return (
    <Card>
      <View style={styles.summaryRow}>
        <View style={styles.flex} aria-label={`Streak: ${streak.current} ${streak.current === 1 ? 'day' : 'days'}`}>
          <ThemedText style={styles.summaryBig}>🔥 {streak.current}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            day streak
          </ThemedText>
        </View>
        <View style={styles.flex} aria-label={`Today: ${streak.todayXp} of ${goal} XP`}>
          <ThemedText style={styles.summaryBig}>
            {streak.todayXp}/{goal}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            XP today
          </ThemedText>
        </View>
        <View style={styles.flex} aria-label={`Level ${level.level}`}>
          <ThemedText style={styles.summaryBig}>⭐ {level.level}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            level
          </ThemedText>
        </View>
      </View>
      <Bar value={streak.todayXp / goal} label="Daily goal" />
      <ThemedText type="small" themeColor={streak.todayMet ? 'success' : streak.atRisk ? 'warning' : 'textSecondary'} role="status">
        {streak.todayMet
          ? '✓ Daily goal reached. 太棒了！'
          : streak.atRisk
            ? `You missed yesterday — your streak freeze saved it. Reach your goal today to keep your ${streak.current}-day streak.`
            : `${goal - streak.todayXp} XP to go today.`}
      </ThemedText>
      <Button label="See your progress" variant="secondary" onPress={() => router.push('/progress')} />
    </Card>
  );
}

/** Web only: a nudge when nothing was studied today (iPhone gets a notification instead). */
export function StudyReminderBanner() {
  const theme = useTheme();
  const p = useProgressSummary();
  if (Platform.OS !== 'web' || !p.ready || p.streak.todayXp > 0) return null;
  return (
    <View role="alert" style={[styles.banner, { borderColor: theme.warning, backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="label">⏰ You haven&apos;t studied today.</ThemedText>
      <ThemedText themeColor="textSecondary">
        {p.streak.current > 0 ? `A few minutes keep your ${p.streak.current}-day streak going.` : 'A few minutes start a new streak.'}
      </ThemedText>
    </View>
  );
}

const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];
const LEVEL_OPACITY = [0, 0.3, 0.5, 0.75, 1];

/**
 * Activity calendar: the last 12 weeks, one column per week (Monday on top), one hue light → dark
 * by XP relative to the daily goal. Every cell has a label (date and XP), so color is never alone.
 */
export function ActivityCalendar({ days, today, goal }: { days: DayActivity[]; today: string; goal: number }) {
  const theme = useTheme();
  const xpOn = new Map(days.map((d) => [d.day, d.xp]));
  const weeks = calendarWeeks(today, 12);
  const cell = (day: string) => {
    if (day > today) return <View key={day} style={styles.cell} />;
    const xp = xpOn.get(day) ?? 0;
    const level = intensity(xp, goal);
    const date = new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return (
      <View
        key={day}
        role="img"
        aria-label={`${date}: ${xp} XP`}
        // @ts-expect-error title shows a tooltip on the web
        title={`${date}: ${xp} XP`}
        style={[
          styles.cell,
          { backgroundColor: level ? theme.tint : theme.backgroundSelected, opacity: level ? LEVEL_OPACITY[level] : 1 },
          day === today && { borderWidth: 2, borderColor: theme.text },
        ]}
      />
    );
  };
  return (
    <View style={styles.gapSmall}>
      <View style={styles.calendar} aria-label="Activity in the last 12 weeks">
        <View style={styles.week}>
          {DAY_LABELS.map((l, i) => (
            <ThemedText key={i} style={styles.dayLabel} themeColor="textSecondary">
              {l}
            </ThemedText>
          ))}
        </View>
        {weeks.map((w) => (
          <View key={w[0]} style={styles.week}>
            {w.map(cell)}
          </View>
        ))}
      </View>
      <View style={styles.legend} aria-hidden>
        <ThemedText type="small" themeColor="textSecondary">
          Less
        </ThemedText>
        {LEVEL_OPACITY.map((o, i) => (
          <View key={i} style={[styles.legendCell, { backgroundColor: i ? theme.tint : theme.backgroundSelected, opacity: i ? o : 1 }]} />
        ))}
        <ThemedText type="small" themeColor="textSecondary">
          More (goal ×2)
        </ThemedText>
      </View>
    </View>
  );
}

export function ChallengeList({ title, items }: { title: string; items: Challenge[] }) {
  return (
    <View style={styles.gapSmall}>
      <ThemedText type="heading">{title}</ThemedText>
      <View role="list" style={styles.gapSmall}>
        {items.map((c) => (
          <View key={c.id} role="listitem" style={styles.gapTiny} aria-label={`${c.title}: ${c.progress} of ${c.target}${c.done ? ', done' : ''}`}>
            <View style={styles.row}>
              <ThemedText style={styles.flex}>
                {c.done ? '✅ ' : ''}
                {c.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {c.progress}/{c.target}
              </ThemedText>
            </View>
            <Bar value={c.progress / c.target} label={c.title} height={6} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function BadgeGrid({ badges }: { badges: Badge[] }) {
  const theme = useTheme();
  const earned = badges.filter((b) => b.earned).length;
  return (
    <View style={styles.gapSmall}>
      <ThemedText type="heading">
        Badges · {earned} of {badges.length}
      </ThemedText>
      <View role="list" style={styles.badges}>
        {badges.map((b) => (
          <View
            key={b.id}
            role="listitem"
            aria-label={`${b.title}: ${b.description}. ${b.earned ? 'Earned' : `${b.progress[0]} of ${b.progress[1]}`}`}
            style={[styles.badge, { borderColor: b.earned ? theme.tint : theme.border, backgroundColor: theme.backgroundElement, opacity: b.earned ? 1 : 0.6 }]}>
            <ThemedText style={[styles.badgeIcon, !b.earned && styles.locked]}>{b.icon}</ThemedText>
            <ThemedText type="smallBold" style={styles.center}>
              {b.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {b.earned ? 'Earned' : `${b.progress[0]}/${b.progress[1]}`}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

type Skill = { label: string; value: number | null; detail: string };

const pct = (correct: number, total: number) => (total ? Math.round((correct / total) * 100) : null);

/** Skills breakdown from the stats: accuracy (or average score) per skill, with how much was done. */
export function skillsOf(stats: Stats): Skill[] {
  const k = (kind: string) => stats.skills[kind] ?? { activities: 0, correct: 0, total: 0 };
  const listen = { a: k('listening').activities + k('tones').activities, c: k('listening').correct + k('tones').correct, t: k('listening').total + k('tones').total };
  return [
    { label: 'Vocabulary', value: stats.review_accuracy, detail: `${stats.words_learned} words, review accuracy` },
    { label: 'Characters', value: pct(k('characters').correct, k('characters').total), detail: `${k('characters').activities} quizzes, ${stats.characters_written} written in review` },
    {
      label: 'Grammar',
      value: stats.grammar_practised ? Math.round(Object.values(stats.grammar_by_level).reduce((n, g) => n + g.avg * g.points, 0) / stats.grammar_practised) : null,
      detail: `${stats.grammar_practised} points practised, average best score`,
    },
    { label: 'Reading', value: stats.reading_avg, detail: `${stats.readings} texts, average score` },
    { label: 'Listening', value: pct(listen.c, listen.t), detail: `${listen.a} quizzes, right answers` },
    { label: 'Speaking', value: null, detail: `${stats.pronunciation_checks} pronunciation checks` },
  ];
}

export function SkillBars({ stats }: { stats: Stats }) {
  return (
    <View role="list" aria-label="Skills" style={styles.gapSmall}>
      {skillsOf(stats).map((s) => (
        <View key={s.label} role="listitem" style={styles.gapTiny}>
          <View style={styles.row}>
            <ThemedText type="label" style={styles.flex}>
              {s.label}
            </ThemedText>
            <ThemedText type="smallBold">{s.value === null ? '—' : `${s.value}%`}</ThemedText>
          </View>
          {s.value !== null ? <Bar value={s.value / 100} label={`${s.label}: ${s.value}%`} height={8} /> : null}
          <ThemedText type="small" themeColor="textSecondary">
            {s.detail}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

/** A tappable row that looks like a list link. */
export function LinkRow({ label, detail, onPress }: { label: string; detail?: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      role="link"
      aria-label={label}
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement }]}>
      <ThemedText type="label" style={styles.flex}>
        {label}
      </ThemedText>
      {detail ? (
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      ) : null}
      <ThemedText themeColor="textSecondary">›</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  gapSmall: { gap: Spacing.two },
  gapTiny: { gap: Spacing.one },
  center: { textAlign: 'center' },
  track: { borderRadius: Radius.small, overflow: 'hidden', alignSelf: 'stretch' },
  fill: { height: '100%', borderRadius: 4 },
  tile: { flexGrow: 1, flexBasis: 140, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three, gap: Spacing.half },
  tileValue: { fontSize: 28, lineHeight: 34, fontWeight: 700 },
  summaryRow: { flexDirection: 'row', gap: Spacing.two },
  summaryBig: { fontSize: 24, lineHeight: 30, fontWeight: 700 },
  banner: { borderWidth: 1, borderLeftWidth: 4, borderRadius: Radius.medium, padding: Spacing.three, gap: Spacing.one },
  calendar: { flexDirection: 'row', gap: 3 },
  week: { gap: 3 },
  cell: { width: 16, height: 16, borderRadius: 4 },
  dayLabel: { fontSize: 10, lineHeight: 16, height: 16, width: 26 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendCell: { width: 12, height: 12, borderRadius: 3 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  badge: { width: 104, alignItems: 'center', borderWidth: 1, borderRadius: Radius.medium, padding: Spacing.two, gap: Spacing.half },
  badgeIcon: { fontSize: 30, lineHeight: 38 },
  locked: { opacity: 0.5 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three },
});
