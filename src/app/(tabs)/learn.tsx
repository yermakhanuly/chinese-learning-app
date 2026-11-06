import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card, ComingSoon } from '@/components/card';
import { PressableLink } from '@/components/pressable-link';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import {
  allLessons,
  GOAL_THEMES,
  nextLesson,
  useCourse,
  useProgress,
  type LessonSummary,
  type Progress,
  type UnitWithLessons,
} from '@/hooks/use-course';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth';

export default function LearnScreen() {
  const { session } = useAuth();
  const profile = useProfile().data;
  const course = useCourse(1);
  const progress = useProgress().data;
  const units = course.data ?? [];
  const lessons = allLessons(units);
  const next = units.length ? nextLesson(units, progress, profile?.start_lesson_id) : null;
  const doneCount = lessons.filter((l) => progress?.has(l.id)).length;
  const goalThemes = profile?.learning_goal ? GOAL_THEMES[profile.learning_goal] : [];
  const startIndex = lessons.findIndex((l) => l.id === profile?.start_lesson_id);

  return (
    <Screen title="Learn" subtitle="HSK 1 · 10 themed units">
      {course.isPending ? (
        <ActivityIndicator />
      ) : course.isError ? (
        <ThemedText themeColor="danger">Couldn&apos;t load the course. Check your connection.</ThemedText>
      ) : (
        <>
          {next ? <ContinueCard lesson={next} unit={units.find((u) => u.id === next.unit_id)!} done={doneCount} total={lessons.length} /> : null}
          {!profile?.placed_at && doneCount === 0 ? (
            <Card title="Already know some Chinese?">
              <ThemedText themeColor="textSecondary">
                Take a 3-minute placement test and start where you belong.
              </ThemedText>
              <Button label="Take the placement test" variant="secondary" onPress={() => router.push('/placement')} />
            </Card>
          ) : null}
          {!session ? (
            <ThemedText themeColor="textSecondary">Lessons are free to try. Log in to save your progress.</ThemedText>
          ) : null}
          <Card title="Listening & speaking 听说">
            <ThemedText themeColor="textSecondary">
              Tone trainer, listening quizzes and pronunciation checks with natural voices.
            </ThemedText>
            <Button label="Open listening & speaking" variant="secondary" onPress={() => router.push('/listening')} />
          </Card>
          <Card title="Characters 汉字">
            <ThemedText themeColor="textSecondary">
              Stroke order, handwriting practice, recognition quizzes and look-alike drills.
            </ThemedText>
            <Button label="Open characters" variant="secondary" onPress={() => router.push('/characters')} />
          </Card>
          {units.map((u) => (
            <UnitCard
              key={u.id}
              unit={u}
              progress={progress}
              nextId={next?.id}
              matchesGoal={goalThemes.includes(u.theme ?? '')}
              skipped={(l) => startIndex > 0 && lessons.indexOf(l) < startIndex}
            />
          ))}
          <ComingSoon phase={3} items={['HSK 2–9 lessons are added after HSK 1 is reviewed']} />
        </>
      )}
    </Screen>
  );
}

function ContinueCard({ lesson, unit, done, total }: { lesson: LessonSummary; unit: UnitWithLessons; done: number; total: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.continue, { backgroundColor: theme.tint }]}>
      <ThemedText type="smallBold" style={{ color: theme.onTint }}>
        {done ? `CONTINUE · ${done} of ${total} done` : 'START HERE'}
      </ThemedText>
      <ThemedText type="subtitle" style={{ color: theme.onTint }}>
        {lesson.title}
      </ThemedText>
      <ThemedText style={{ color: theme.onTint }}>
        Unit {unit.position}: {unit.title} · {lesson.minutes} min
      </ThemedText>
      <Button
        label={done ? 'Continue' : 'Start lesson'}
        variant="secondary"
        onPress={() => router.push({ pathname: '/lesson', params: { id: lesson.id } })}
      />
    </View>
  );
}

function UnitCard({
  unit,
  progress,
  nextId,
  matchesGoal,
  skipped,
}: {
  unit: UnitWithLessons;
  progress: Progress | undefined;
  nextId: string | undefined;
  matchesGoal: boolean;
  skipped: (l: LessonSummary) => boolean;
}) {
  const theme = useTheme();
  const done = unit.lessons.filter((l) => progress?.has(l.id)).length;
  return (
    <View style={[styles.unit, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.unitHeader}>
        <ThemedText type="hanzi" themeColor="tint" style={styles.unitHanzi}>
          {unit.title_zh}
        </ThemedText>
        <View style={styles.flex}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            UNIT {unit.position} · {done}/{unit.lessons.length}
          </ThemedText>
          <ThemedText type="heading">{unit.title}</ThemedText>
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {unit.description}
      </ThemedText>
      {matchesGoal ? (
        <ThemedText type="smallBold" themeColor="success">
          ★ Matches your goal
        </ThemedText>
      ) : null}
      <View role="list" style={styles.lessons}>
        {unit.lessons.map((l) => (
          <LessonRow key={l.id} lesson={l} score={progress?.get(l.id)?.best_score} isNext={l.id === nextId} skipped={skipped(l)} />
        ))}
      </View>
    </View>
  );
}

function LessonRow({ lesson, score, isNext, skipped }: { lesson: LessonSummary; score?: number; isNext: boolean; skipped: boolean }) {
  const theme = useTheme();
  const done = score !== undefined;
  const status = done ? `done, best ${score}%` : isNext ? 'next' : skipped ? 'skipped by placement' : 'not started';
  const icon = done
    ? { ios: 'checkmark.circle.fill', web: 'check_circle' }
    : isNext
      ? { ios: 'play.circle.fill', web: 'play_circle' }
      : lesson.kind === 'quiz'
        ? { ios: 'star.circle', web: 'stars' }
        : { ios: 'circle', web: 'radio_button_unchecked' };
  return (
    <View role="listitem">
      <PressableLink
        href={{ pathname: '/lesson', params: { id: lesson.id } }}
        aria-label={`${lesson.kind === 'quiz' ? 'Quiz' : 'Lesson'}: ${lesson.title}, ${status}`}
        style={({ pressed }) => [
          styles.lessonRow,
          { backgroundColor: isNext ? theme.background : 'transparent', borderColor: isNext ? theme.tint : 'transparent' },
          pressed && { backgroundColor: theme.backgroundSelected },
        ]}>
        <SymbolView
          name={icon as never}
          size={26}
          tintColor={done ? theme.success : isNext ? theme.tint : theme.textSecondary}
        />
        <View style={styles.flex}>
          <ThemedText type={isNext ? 'label' : 'default'} style={skipped && !done ? { color: theme.textSecondary } : undefined}>
            {lesson.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {lesson.kind === 'quiz' ? 'Unit quiz' : `${lesson.words.length} new words`} · {lesson.minutes} min
            {done ? ` · best ${score}%` : ''}
          </ThemedText>
        </View>
      </PressableLink>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  continue: { borderRadius: Radius.large, padding: Spacing.four, gap: Spacing.two },
  unit: { borderRadius: Radius.medium, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.three, gap: Spacing.two },
  unitHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  unitHanzi: { fontSize: 26, lineHeight: 34 },
  lessons: { gap: Spacing.one, marginTop: Spacing.one },
  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.small,
    borderWidth: 1,
  },
});
