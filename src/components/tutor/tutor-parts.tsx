import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Pinyin } from '@/components/word-parts';
import { Radius, Spacing } from '@/constants/theme';
import { useIsPremium, useSpeakTutor } from '@/hooks/use-tutor';
import { useTheme } from '@/hooks/use-theme';
import { useRecorder } from '@/lib/recorder';
import { useSpeech } from '@/lib/speech';
import type { Correction, ConversationFeedback } from '@/lib/tutor';
import { useDisplayPreferences } from '@/providers/display-preferences';
import { useAuth } from '@/providers/auth';

/** Shows `children` to premium learners; everyone else gets a log-in or Premium card. */
export function PremiumGate({ feature, children }: { feature: string; children: ReactNode }) {
  const { session } = useAuth();
  const { premium, loading } = useIsPremium();
  if (!session) {
    return (
      <Card title={`Log in to use ${feature}`}>
        <ThemedText themeColor="textSecondary">The AI tutor is part of Premium, saved in your account.</ThemedText>
        <Button label="Log in" onPress={() => router.push('/sign-in')} />
      </Card>
    );
  }
  if (loading) return <ActivityIndicator />;
  if (!premium) return <PremiumCard feature={feature} />;
  return <>{children}</>;
}

export function PremiumCard({ feature }: { feature: string }) {
  return (
    <Card title={`✨ ${feature} is part of Premium`}>
      <ThemedText themeColor="textSecondary">
        Premium adds an AI tutor: role-play conversations with corrections, voice practice, sentence checks and
        explanations, personalised examples and quizzes.
      </ThemedText>
      <Button label="About Premium" onPress={() => router.push('/premium')} />
    </Card>
  );
}

/** A Chinese line with optional pinyin and English, and a natural-voice play button. */
export function ChineseLine({
  id,
  zh,
  pinyin,
  en,
  voice,
  showPinyin,
  showEnglish,
  size = 22,
}: {
  id: string;
  zh: string;
  pinyin?: string;
  en?: string;
  voice?: 'female' | 'male';
  showPinyin: boolean;
  showEnglish: boolean;
  size?: number;
}) {
  const theme = useTheme();
  const { hanziScale } = useDisplayPreferences();
  const fontSize = Math.round(size * hanziScale);
  return (
    <View style={styles.line}>
      <View style={styles.lineText}>
        <ThemedText lang="zh" style={{ fontSize, lineHeight: Math.round(fontSize * 1.35), fontWeight: 500, color: theme.text }}>
          {zh}
        </ThemedText>
        {showPinyin && pinyin ? <Pinyin text={pinyin} size={15} /> : null}
        {showEnglish && en ? (
          <ThemedText type="small" themeColor="textSecondary">
            {en}
          </ThemedText>
        ) : null}
      </View>
      <TutorSpeakButton id={id} text={zh} voice={voice} />
    </View>
  );
}

/** Plays a tutor line in Azure's natural voice (falls back to nothing if offline: the button shows an error). */
export function TutorSpeakButton({ id, text, voice }: { id: string; text: string; voice?: 'female' | 'male' }) {
  const theme = useTheme();
  const { playingId, stop } = useSpeech();
  const speak = useSpeakTutor();
  const playing = playingId === id;
  return (
    <Pressable
      role="button"
      aria-label={playing ? 'Stop' : speak.isError ? 'Couldn’t play. Try again' : 'Listen'}
      onPress={() => (playing ? stop() : speak.mutate({ text, voice, id }))}
      hitSlop={8}
      style={({ pressed }) => [styles.round, { backgroundColor: playing ? theme.tint : theme.background }, pressed && styles.pressed]}>
      {speak.isPending ? (
        <ActivityIndicator color={theme.tint} />
      ) : (
        <SymbolView
          name={{ ios: playing ? 'stop.fill' : 'speaker.wave.2.fill', web: playing ? 'stop_circle' : 'volume_up' }}
          size={18}
          tintColor={playing ? theme.onTint : speak.isError ? theme.danger : theme.tint}
        />
      )}
    </Pressable>
  );
}

/** Under a learner message: ✓, or the corrected sentence with a "Why?" explanation. */
export function CorrectionNote({ correction, showPinyin }: { correction: Correction; showPinyin: boolean }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  if (correction.ok) {
    return (
      <ThemedText type="small" themeColor="success" aria-label="Correct">
        ✓ Good
      </ThemedText>
    );
  }
  return (
    <View
      role="note"
      aria-label={`Correction: ${correction.corrected}`}
      style={[styles.correction, { borderColor: theme.warning, backgroundColor: theme.background }]}>
      <ThemedText type="smallBold" themeColor="warning">
        ✎ Better{correction.kind ? ` · ${correction.kind}` : ''}
      </ThemedText>
      <ThemedText lang="zh" style={styles.corrected}>
        {correction.corrected}
      </ThemedText>
      {showPinyin && correction.corrected_pinyin ? <Pinyin text={correction.corrected_pinyin} size={14} /> : null}
      {correction.explanation ? (
        <ThemedText type="link" role="button" aria-expanded={open} onPress={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Why?'}
        </ThemedText>
      ) : null}
      {open ? <ThemedText type="small">{correction.explanation}</ThemedText> : null}
    </View>
  );
}

export function FeedbackCard({ feedback, mistakes }: { feedback: ConversationFeedback; mistakes: { said: string; correction: Correction }[] }) {
  return (
    <Card title="How it went">
      <ThemedText type="subtitle" aria-label={`Score: ${feedback.score} out of 100`}>
        {feedback.score} / 100
      </ThemedText>
      <ThemedText>{feedback.summary}</ThemedText>
      {feedback.strengths.length ? (
        <View style={styles.gapSmall}>
          <ThemedText type="smallBold">What went well</ThemedText>
          {feedback.strengths.map((s) => (
            <ThemedText key={s}>• {s}</ThemedText>
          ))}
        </View>
      ) : null}
      {feedback.focus.length ? (
        <View style={styles.gapSmall}>
          <ThemedText type="smallBold">Practise next</ThemedText>
          {feedback.focus.map((s) => (
            <ThemedText key={s}>• {s}</ThemedText>
          ))}
        </View>
      ) : null}
      {mistakes.length ? (
        <View style={styles.gapSmall}>
          <ThemedText type="smallBold">Your corrections ({mistakes.length})</ThemedText>
          {mistakes.map((m, i) => (
            <View key={i} style={styles.gapTiny}>
              <ThemedText lang="zh" themeColor="textSecondary" style={styles.strike}>
                {m.said}
              </ThemedText>
              <ThemedText lang="zh">→ {m.correction.corrected}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {m.correction.explanation}
              </ThemedText>
            </View>
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            They&apos;re saved in your mistake notebook.
          </ThemedText>
        </View>
      ) : null}
    </Card>
  );
}

const MAX_SECONDS = 20;

/** Hold to talk: records while pressed, sends the recording when released. */
export function HoldToTalk({ onRecorded, disabled }: { onRecorded: (wav: Uint8Array) => void; disabled?: boolean }) {
  const theme = useTheme();
  const recorder = useRecorder();
  const [seconds, setSeconds] = useState(0);
  const [tooShort, setTooShort] = useState(false);
  const holding = useRef(false);

  async function begin() {
    if (disabled) return;
    holding.current = true;
    setTooShort(false);
    setSeconds(0);
    const ok = await recorder.start();
    // Released before the microphone was ready.
    if (ok && !holding.current) void finish();
  }

  async function finish() {
    holding.current = false;
    const r = await recorder.stop(); // null if it never started
    if (!r) return;
    if (r.durationMs < 500) setTooShort(true);
    else onRecorded(r.wav);
  }

  useEffect(() => {
    if (!recorder.recording) return;
    const started = Date.now();
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) void finish();
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.recording]);

  return (
    <View style={styles.talk}>
      <Pressable
        role="button"
        aria-label={recorder.recording ? 'Recording… release to send' : 'Hold to talk'}
        aria-disabled={disabled}
        onPressIn={begin}
        onPressOut={finish}
        style={({ pressed }) => [
          styles.mic,
          { backgroundColor: recorder.recording ? theme.danger : disabled ? theme.backgroundSelected : theme.tint },
          pressed && styles.pressed,
        ]}>
        <SymbolView name={{ ios: 'mic.fill', web: 'mic' }} size={26} tintColor={theme.onTint} />
      </Pressable>
      <ThemedText type="small" themeColor={recorder.error || tooShort ? 'danger' : 'textSecondary'} role={recorder.error || tooShort ? 'alert' : undefined}>
        {recorder.error
          ? recorder.error
          : tooShort
            ? 'Too short. Hold the button while you speak.'
            : recorder.recording
              ? `Recording… ${seconds}s · release to send`
              : 'Hold to talk'}
      </ThemedText>
    </View>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const theme = useTheme();
  return (
    <Pressable
      role="switch"
      aria-checked={value}
      aria-label={label}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.toggle,
        { borderColor: value ? theme.tint : theme.border, backgroundColor: value ? theme.backgroundSelected : theme.background },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" themeColor={value ? 'tint' : 'textSecondary'}>
        {value ? '✓ ' : ''}
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  lineText: { flex: 1, gap: Spacing.half },
  round: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  correction: { borderLeftWidth: 3, borderRadius: Radius.small, padding: Spacing.two, gap: Spacing.half },
  corrected: { fontSize: 18, lineHeight: 26 },
  strike: { textDecorationLine: 'line-through' },
  gapSmall: { gap: Spacing.one },
  gapTiny: { gap: Spacing.half, paddingBottom: Spacing.one },
  talk: { alignItems: 'center', gap: Spacing.one },
  mic: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  toggle: { borderWidth: 1, borderRadius: Radius.small, paddingHorizontal: Spacing.two + 2, paddingVertical: Spacing.one + 2 },
});
