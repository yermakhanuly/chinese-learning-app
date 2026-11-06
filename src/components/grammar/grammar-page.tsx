import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LessonDataContext, Zh } from '@/components/lesson/lesson-parts';
import { PressableLink } from '@/components/pressable-link';
import { SayItLink } from '@/components/sentence-view';
import { ThemedText } from '@/components/themed-text';
import { SpeakButton } from '@/components/word-parts';
import { GRAMMAR_TOPICS } from '@/constants/grammar-topics';
import { Radius, Spacing } from '@/constants/theme';
import { allLessons, useCourse } from '@/hooks/use-course';
import { useGrammarCard, useGrammarPoint, useGrammarProgress, useGrammarTitles, type GrammarPointRow } from '@/hooks/use-grammar';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth';

/**
 * One grammar point: patterns, explanation, examples with audio, common mistakes, practice and
 * related points. `inModal`: opened from a lesson (links stay inside the modal, no lesson links).
 */
export function GrammarPage({ id, inModal = false }: { id: string | undefined; inModal?: boolean }) {
  const point = useGrammarPoint(id);
  if (point.isPending) return <ActivityIndicator style={styles.loading} />;
  if (!point.data) {
    return (
      <ThemedText themeColor={point.isError ? 'danger' : 'textSecondary'}>
        {point.isError ? "Couldn't load this grammar point. Check your connection." : 'Grammar point not found.'}
      </ThemedText>
    );
  }
  return <PointBody point={point.data} inModal={inModal} />;
}

function PointBody({ point, inModal }: { point: GrammarPointRow; inModal: boolean }) {
  const theme = useTheme();
  const { session } = useAuth();
  const score = useGrammarProgress().data?.get(point.id);
  const titles = useGrammarTitles();
  const data = useMemo(() => ({ readings: point.readings, wordDetails: {}, seed: point.id }), [point]);
  const topic = GRAMMAR_TOPICS.find((t) => t.slug === point.topic);

  return (
    <LessonDataContext value={data}>
      <View style={styles.gap}>
        <View style={styles.gapSmall}>
          <ThemedText type="small" themeColor="tint">
            HSK {point.hsk_level} · {topic?.name ?? point.topic}
          </ThemedText>
          <ThemedText type="title">{point.title}</ThemedText>
          <ThemedText type="subtitle" themeColor="textSecondary">
            {point.summary}
          </ThemedText>
        </View>

        <View aria-label="Sentence patterns" style={styles.gapSmall}>
          {point.structure.map((s) => (
            <View key={s} style={[styles.pattern, { borderColor: theme.tint, backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="label" lang="zh">
                {s}
              </ThemedText>
            </View>
          ))}
        </View>

        {point.explanation.split(/\n\s*\n/).map((para, i) => (
          <ThemedText key={i}>{para.trim()}</ThemedText>
        ))}

        <ThemedText type="heading">Examples</ThemedText>
        <View role="list" style={styles.gapSmall}>
          {point.examples.map((e) => (
            <View
              key={e.zh}
              role="listitem"
              style={[styles.example, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Zh text={e.zh} />
                </View>
                <SpeakButton text={e.zh} label={`Play: ${e.zh}`} size={36} />
              </View>
              <ThemedText themeColor="textSecondary">{e.en}</ThemedText>
              {inModal ? null : <SayItLink text={e.zh} meaning={e.en} />}
            </View>
          ))}
        </View>

        <ThemedText type="heading">Common mistakes</ThemedText>
        {point.mistakes.map((m) => (
          <View key={m.wrong} style={[styles.example, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <View style={styles.row} aria-label={`Wrong: ${m.wrong}`}>
              <ThemedText type="label" themeColor="danger">
                ✗
              </ThemedText>
              <View style={styles.flex}>
                <Zh text={m.wrong} size={20} />
              </View>
            </View>
            <View style={styles.row} aria-label={`Right: ${m.right}`}>
              <ThemedText type="label" themeColor="success">
                ✓
              </ThemedText>
              <View style={styles.flex}>
                <Zh text={m.right} size={20} />
              </View>
              <SpeakButton text={m.right} label={`Play: ${m.right}`} size={32} />
            </View>
            <ThemedText themeColor="textSecondary">{m.why}</ThemedText>
          </View>
        ))}

        <Card title="Practice">
          <ThemedText themeColor="textSecondary">
            {point.exercises.length} exercises: fill the gap, pick the right sentence, change a sentence, put words in order.
            {score !== undefined ? ` Your best: ${score}%.` : ''}
          </ThemedText>
          <Button
            label={score !== undefined ? 'Practise again' : 'Practise this point'}
            onPress={() => router.push({ pathname: '/grammar-practice', params: { id: point.id } })}
          />
          {session ? <ReviewToggle id={point.id} /> : null}
        </Card>

        {point.related.length ? (
          <>
            <ThemedText type="heading">Related</ThemedText>
            <View style={styles.gapSmall}>
              {point.related.map((r) => (
                <PressableLink
                  key={r}
                  href={{ pathname: inModal ? '/grammar-note' : '/grammar-point', params: { id: r } }}
                  style={({ pressed }) => [styles.link, { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : theme.background }]}>
                  <ThemedText type="link">{titles.get(r) ?? r}</ThemedText>
                </PressableLink>
              ))}
            </View>
          </>
        ) : null}

        {!inModal && point.lessons.length ? <LessonLinks lessonIds={point.lessons} /> : null}
      </View>
    </LessonDataContext>
  );
}

function ReviewToggle({ id }: { id: string }) {
  const { status, toggle } = useGrammarCard(id);
  if (status.isPending) return null;
  const added = status.data;
  return (
    <>
      <Button
        label={toggle.isPending ? 'Saving…' : added ? 'Remove from review' : 'Add to review'}
        variant="secondary"
        disabled={toggle.isPending}
        onPress={() => toggle.mutate(!added)}
      />
      <ThemedText type="small" themeColor={toggle.isError ? 'danger' : 'textSecondary'} role="status">
        {toggle.isError
          ? "Couldn't save. Try again."
          : added
            ? '✓ In your review: one exercise of this point comes back now and then.'
            : 'Add it to review to get one of its exercises now and then.'}
      </ThemedText>
    </>
  );
}

function LessonLinks({ lessonIds }: { lessonIds: string[] }) {
  const theme = useTheme();
  const course = useCourse(1).data;
  const lessons = course ? allLessons(course).filter((l) => lessonIds.includes(l.id)) : [];
  if (!lessons.length) return null;
  return (
    <>
      <ThemedText type="heading">In the course</ThemedText>
      {lessons.map((l) => (
        <PressableLink
          key={l.id}
          href={{ pathname: '/lesson', params: { id: l.id } }}
          style={({ pressed }) => [styles.link, { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : theme.background }]}>
          <ThemedText type="link">Lesson: {l.title}</ThemedText>
        </PressableLink>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: Spacing.five },
  gap: { gap: Spacing.three },
  gapSmall: { gap: Spacing.two },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  pattern: { borderLeftWidth: 4, borderRadius: Radius.small, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  example: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three, gap: Spacing.two },
  link: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three },
});
