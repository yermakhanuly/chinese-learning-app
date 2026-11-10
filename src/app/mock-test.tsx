import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { closeModal } from '@/components/close-button';
import { LessonDataContext, Zh } from '@/components/lesson/lesson-parts';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useHydrated } from '@/hooks/use-hydrated';
import { useCompleteMock, useMockTest, type MockTestRow } from '@/hooks/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { MAX_PLAYS, PASS_MARK, isRight, scoreMock, type MockAnswer, type MockQuestion } from '@/lib/mock-test';
import { speakChinese, stopSpeech, useSpeech } from '@/lib/speech';
import { useAuth } from '@/providers/auth';

/** /mock-test?level=1 — a timed mock HSK test: listening, then reading; scored /200. */
export default function MockTestScreen() {
  const hydrated = useHydrated();
  const { level } = useLocalSearchParams<{ level?: string }>();
  const id = level === '2' ? 'hsk2' : 'hsk1';
  const test = useMockTest(hydrated ? id : undefined);
  const theme = useTheme();
  useEffect(() => () => void stopSpeech(), []);

  if (!hydrated || test.isPending) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!test.data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ThemedText>{test.isError ? "Couldn't load the test. Check your connection." : 'Test not found.'}</ThemedText>
        <Button label="Back" variant="secondary" onPress={closeModal} />
      </View>
    );
  }
  return <MockTestFlow key={test.data.id} test={test.data} />;
}

type Phase = 'intro' | 'test' | 'done';

function MockTestFlow({ test }: { test: MockTestRow }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('intro');
  const [answers, setAnswers] = useState<MockAnswer[][]>(() => test.sections.map((s) => s.questions.map(() => null)));
  const [pos, setPos] = useState({ section: 0, question: 0 });
  const [plays, setPlays] = useState<Record<string, number>>({});
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const data = useMemo(() => ({ readings: test.readings, wordDetails: {}, seed: test.id }), [test]);

  // Timer: ticks every second while the test runs; time up hands the test in.
  useEffect(() => {
    if (phase !== 'test') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);
  const left = endsAt ? Math.max(0, Math.round((endsAt - now) / 1000)) : test.minutes * 60;
  const timeUp = phase === 'test' && left === 0;
  if (timeUp) setPhase('done');

  if (phase === 'intro') {
    const count = test.sections.reduce((n, s) => n + s.questions.length, 0);
    return (
      <View style={[styles.center, { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.inner, styles.intro]}>
          <ThemedText type="title" style={styles.centerText}>
            {test.title}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            {count} questions · {test.minutes} minutes · listening and reading, each scored out of 100. You pass with {PASS_MARK} / 200, as
            in the real HSK {test.level}.
          </ThemedText>
          {test.sections.map((s) => (
            <ThemedText key={s.id} style={styles.centerText}>
              {s.title}: {s.questions.length} questions
            </ThemedText>
          ))}
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
            Each recording can be played {MAX_PLAYS} times. You can go back to earlier questions until you hand the test in.
          </ThemedText>
          <Button
            label="Start the test"
            onPress={() => {
              setEndsAt(Date.now() + test.minutes * 60 * 1000);
              setNow(Date.now());
              setPhase('test');
            }}
          />
          <Button label="Not now" variant="ghost" onPress={closeModal} />
        </View>
      </View>
    );
  }

  if (phase === 'done') return <Results test={test} answers={answers} timeUp={left === 0} />;

  const section = test.sections[pos.section];
  const q = section.questions[pos.question];
  const key = `${pos.section}-${pos.question}`;
  const answer = answers[pos.section][pos.question];
  const isLast = pos.section === test.sections.length - 1 && pos.question === section.questions.length - 1;
  const setAnswer = (a: MockAnswer) =>
    setAnswers((all) => all.map((s, si) => (si === pos.section ? s.map((x, qi) => (qi === pos.question ? a : x)) : s)));
  const go = (delta: number) => {
    void stopSpeech();
    let { section: si, question: qi } = pos;
    qi += delta;
    if (qi >= test.sections[si].questions.length && si < test.sections.length - 1) {
      si++;
      qi = 0;
    } else if (qi < 0 && si > 0) {
      si--;
      qi = test.sections[si].questions.length - 1;
    }
    setPos({ section: si, question: Math.max(0, qi) });
  };
  const answered = answers.flat().filter((a) => a !== null).length;
  const total = answers.flat().length;

  return (
    <LessonDataContext value={data}>
      <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.topBar}>
          <Pressable role="button" aria-label="Close test" onPress={closeModal} hitSlop={12}>
            <SymbolView name={{ ios: 'xmark', web: 'close' }} size={22} tintColor={theme.textSecondary} />
          </Pressable>
          <ThemedText type="smallBold" style={styles.flex}>
            {section.title} · {pos.question + 1}/{section.questions.length}
          </ThemedText>
          <ThemedText type="smallBold" themeColor={left < 60 ? 'danger' : 'textSecondary'} role="timer" aria-label={`Time left ${Math.floor(left / 60)} minutes ${left % 60} seconds`}>
            ⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          </ThemedText>
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={styles.body}>
          <View key={key} style={styles.inner}>
            {pos.question === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {section.instructions}
              </ThemedText>
            ) : null}
            <Question
              q={q}
              answer={answer}
              onAnswer={setAnswer}
              plays={plays[key] ?? 0}
              onPlay={() => setPlays((p) => ({ ...p, [key]: (p[key] ?? 0) + 1 }))}
            />
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three, borderTopColor: theme.border }]}>
          <View style={[styles.inner, styles.footerRow]}>
            <Button label="Back" variant="secondary" disabled={pos.section === 0 && pos.question === 0} onPress={() => go(-1)} style={styles.flex} />
            {isLast ? (
              <Button
                label={`Hand in (${answered}/${total})`}
                onPress={() => {
                  void stopSpeech();
                  setPhase('done');
                }}
                style={styles.flex}
              />
            ) : (
              <Button label="Next" onPress={() => go(1)} style={styles.flex} />
            )}
          </View>
        </View>
      </View>
    </LessonDataContext>
  );
}

/** Plays a recording (one or more lines, one after another) and counts the plays. */
function PlayButton({ lines, plays, onPlay }: { lines: string[]; plays: number; onPlay: () => void }) {
  const theme = useTheme();
  const { playingId } = useSpeech();
  const id = `mock-${lines[0]}`;
  const playing = !!playingId?.startsWith(id);
  const left = MAX_PLAYS - plays;
  const playFrom = (i: number) => {
    if (i >= lines.length) return;
    void speakChinese(lines[i], `${id}-${i}`, lines[i], () => setTimeout(() => playFrom(i + 1), 400));
  };
  return (
    <View style={styles.play}>
      <Pressable
        role="button"
        aria-label={playing ? 'Playing' : left > 0 ? `Play the recording (${left} left)` : 'No plays left'}
        disabled={playing || left <= 0}
        onPress={() => {
          onPlay();
          playFrom(0);
        }}
        style={[styles.playButton, { backgroundColor: left > 0 || playing ? theme.tint : theme.backgroundSelected }]}>
        <SymbolView name={{ ios: playing ? 'speaker.wave.2.fill' : 'play.fill', web: playing ? 'volume_up' : 'play_arrow' }} size={32} tintColor={theme.onTint} />
      </Pressable>
      <ThemedText type="small" themeColor="textSecondary">
        {playing ? 'Playing…' : left > 0 ? `Plays left: ${left}` : 'No plays left'}
      </ThemedText>
    </View>
  );
}

/** Chinese with a gap (___) shown as a blank line. */
function GapText({ text, size = 24 }: { text: string; size?: number }) {
  const theme = useTheme();
  const parts = text.split('___');
  return (
    <View style={styles.gapLine}>
      {parts.map((p, i) => (
        <View key={i} style={styles.gapLine}>
          {p ? <Zh text={p} size={size} /> : null}
          {i < parts.length - 1 ? <View style={[styles.blank, { borderBottomColor: theme.tint }]} aria-label="blank" /> : null}
        </View>
      ))}
    </View>
  );
}

function Question({
  q,
  answer,
  onAnswer,
  plays,
  onPlay,
}: {
  q: MockQuestion;
  answer: MockAnswer;
  onAnswer: (a: MockAnswer) => void;
  plays: number;
  onPlay: () => void;
}) {
  return (
    <View style={styles.gap}>
      {q.type === 'listen-judge' ? <PlayButton lines={[q.audio]} plays={plays} onPlay={onPlay} /> : null}
      {q.type === 'listen-choice' ? <PlayButton lines={q.audio} plays={plays} onPlay={onPlay} /> : null}
      {q.type === 'read-choice' || q.type === 'read-judge' ? <GapText text={q.text} /> : null}
      {q.type === 'listen-choice' ? <Zh text={q.question} size={22} /> : null}
      {q.type === 'listen-judge' || q.type === 'read-judge' ? (
        <>
          <Zh text={q.statement} size={22} />
          <Options
            label="True or false"
            options={['✓ 对 True', '✗ 错 False']}
            value={answer === null ? null : answer ? 0 : 1}
            onChange={(i) => onAnswer(i === 0)}
          />
        </>
      ) : (
        <Options label="Choose the answer" options={q.options} value={typeof answer === 'number' ? answer : null} onChange={onAnswer} zh />
      )}
    </View>
  );
}

function Options({
  label,
  options,
  value,
  onChange,
  zh,
}: {
  label: string;
  options: string[];
  value: number | null;
  onChange: (i: number) => void;
  zh?: boolean;
}) {
  const theme = useTheme();
  const letters = ['A', 'B', 'C', 'D'];
  return (
    <View role="radiogroup" aria-label={label} style={styles.options}>
      {options.map((o, i) => (
        <Pressable
          key={i}
          role="radio"
          aria-checked={value === i}
          aria-label={o}
          onPress={() => onChange(i)}
          style={[styles.option, { borderColor: value === i ? theme.tint : theme.border, backgroundColor: value === i ? theme.backgroundSelected : theme.backgroundElement }]}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {zh ? letters[i] : ''}
          </ThemedText>
          {zh ? <Zh text={o} size={20} /> : <ThemedText type="label">{o}</ThemedText>}
        </Pressable>
      ))}
    </View>
  );
}

function Results({ test, answers, timeUp }: { test: MockTestRow; answers: MockAnswer[][]; timeUp: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const result = scoreMock(test, answers);
  const save = useCompleteMock();
  const saved = useRef(false);
  const { mutate } = save;
  const [listening, reading] = result.sections;
  useEffect(() => void stopSpeech(), []);
  useEffect(() => {
    if (!session || saved.current) return;
    saved.current = true;
    mutate({ id: test.id, listening: listening.score, reading: reading.score });
  }, [session, mutate, test.id, listening.score, reading.score]);

  const label = (q: MockQuestion, a: MockAnswer) =>
    a === null ? '—' : q.type === 'listen-judge' || q.type === 'read-judge' ? (a ? '对' : '错') : q.options[a as number];
  const rightLabel = (q: MockQuestion) => (q.type === 'listen-judge' || q.type === 'read-judge' ? (q.answer ? '对' : '错') : q.options[q.answer]);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={[styles.body, { paddingTop: insets.top + Spacing.four, paddingBottom: insets.bottom + Spacing.four }]}>
      <View style={styles.inner}>
        <ThemedText style={styles.trophy}>{result.passed ? '🎉' : '📝'}</ThemedText>
        <ThemedText type="title" style={styles.centerText}>
          {result.total} / 200
        </ThemedText>
        <ThemedText type="subtitle" style={styles.centerText} themeColor={result.passed ? 'success' : 'danger'}>
          {result.passed ? `Passed (pass mark ${PASS_MARK})` : `Not passed yet (pass mark ${PASS_MARK})`}
        </ThemedText>
        {timeUp ? (
          <ThemedText style={styles.centerText} themeColor="textSecondary">
            Time was up, so the test was handed in.
          </ThemedText>
        ) : null}
        <View style={styles.footerRow}>
          {result.sections.map((s, i) => (
            <View key={s.id} style={[styles.score, { borderColor: theme.border }]}>
              <ThemedText type="heading">{s.score} / 100</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {test.sections[i].title} · {s.right}/{s.count} right
              </ThemedText>
            </View>
          ))}
        </View>
        <ThemedText themeColor="textSecondary" style={styles.centerText} role="status">
          {!session
            ? 'Log in to save your result.'
            : save.isPending || save.isIdle
              ? 'Saving…'
              : save.isError
                ? "Couldn't save your result. Check your connection."
                : 'Result saved. It counts towards your HSK readiness.'}
        </ThemedText>
        <Button label="Done" onPress={closeModal} />

        <LessonDataContext value={{ readings: test.readings, wordDetails: {}, seed: test.id }}>
          {test.sections.map((s, si) => (
            <View key={s.id} style={styles.gap}>
              <ThemedText type="heading">{s.title}</ThemedText>
              {s.questions.map((q, qi) => {
                const a = answers[si][qi];
                const ok = isRight(q, a);
                return (
                  <View
                    key={qi}
                    style={[styles.review, { borderColor: ok ? theme.success : theme.danger }]}
                    aria-label={`Question ${qi + 1}: ${ok ? 'right' : 'wrong'}`}>
                    <ThemedText type="smallBold" themeColor={ok ? 'success' : 'danger'}>
                      {qi + 1}. {ok ? '✓' : '✗'} Your answer: {label(q, a)}
                      {ok ? '' : ` · Answer: ${rightLabel(q)}`}
                    </ThemedText>
                    {q.type === 'listen-judge' ? <Zh text={q.audio} size={18} /> : null}
                    {q.type === 'listen-choice' ? q.audio.map((l) => <Zh key={l} text={l} size={18} />) : null}
                    {q.type === 'read-choice' || q.type === 'read-judge' ? <GapText text={q.text} size={18} /> : null}
                    <ThemedText type="small" themeColor="textSecondary">
                      {q.why}
                    </ThemedText>
                  </View>
                );
              })}
            </View>
          ))}
        </LessonDataContext>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.three },
  centerText: { textAlign: 'center' },
  intro: { alignItems: 'stretch' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  body: { padding: Spacing.three, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  gap: { gap: Spacing.three },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.three, paddingHorizontal: Spacing.three, alignItems: 'center' },
  footerRow: { flexDirection: 'row', gap: Spacing.two },
  play: { alignItems: 'center', gap: Spacing.one },
  playButton: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  gapLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  blank: { width: 56, borderBottomWidth: 2, marginHorizontal: Spacing.one, height: 30 },
  options: { gap: Spacing.two },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 2, borderRadius: Radius.medium, padding: Spacing.three, minHeight: 56 },
  trophy: { fontSize: 64, lineHeight: 80, textAlign: 'center' },
  score: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three, alignItems: 'center' },
  review: { borderLeftWidth: 4, borderRadius: Radius.small, paddingLeft: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.one },
});
