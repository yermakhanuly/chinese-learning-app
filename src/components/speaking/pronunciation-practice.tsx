import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Line, Polyline, Text as SvgText } from 'react-native-svg';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Pinyin, SpeakButton } from '@/components/word-parts';
import { Radius, Spacing } from '@/constants/theme';
import { useModelPitch, useScorePronunciation, type PronunciationResult } from '@/hooks/use-audio';
import { useTheme } from '@/hooks/use-theme';
import { numberedSyllableToMarked } from '@/lib/pinyin';
import { pitchCurve, trackPitch, type CurvePoint } from '@/lib/pitch';
import { useRecorder } from '@/lib/recorder';
import type { Recording } from '@/lib/recorder.types';
import { playRecording, useSpeech } from '@/lib/speech';
import { useAuth } from '@/providers/auth';

const MAX_SECONDS = 15;

/** Record yourself saying `text` and get Azure's scores plus your pitch over the model's. */
export function PronunciationPractice({ text, pinyin, meaning }: { text: string; pinyin?: string; meaning?: string }) {
  const theme = useTheme();
  const { session } = useAuth();
  const recorder = useRecorder();
  const score = useScorePronunciation();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [seconds, setSeconds] = useState(0);

  // Recording timer, with an automatic stop.
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

  async function begin() {
    score.reset();
    setRecording(null);
    setSeconds(0);
    await recorder.start();
  }

  async function finish() {
    const r = await recorder.stop();
    if (!r) return;
    setRecording(r);
    if (r.durationMs < 300) return;
    score.mutate({ text, wav: r.wav });
  }

  if (!session) {
    return (
      <Card title="Check your pronunciation">
        <ThemedText themeColor="textSecondary">Log in to record yourself and get a score for every syllable.</ThemedText>
        <Button label="Log in" onPress={() => router.push('/sign-in')} />
      </Card>
    );
  }

  const busy = score.isPending;
  return (
    <View style={styles.gap}>
      <Card>
        <View style={styles.prompt}>
          <View style={styles.flex}>
            <ThemedText lang="zh" style={styles.zh}>
              {text}
            </ThemedText>
            {pinyin ? <Pinyin text={pinyin} size={20} /> : null}
            {meaning ? <ThemedText themeColor="textSecondary">{meaning}</ThemedText> : null}
          </View>
          <SpeakButton text={text} label="Listen to the model" size={48} />
        </View>
      </Card>

      <View style={styles.center}>
        <Pressable
          role="button"
          aria-label={recorder.recording ? 'Stop recording' : 'Record yourself'}
          disabled={busy}
          onPress={() => (recorder.recording ? finish() : begin())}
          style={({ pressed }) => [
            styles.mic,
            { backgroundColor: recorder.recording ? theme.danger : theme.tint, opacity: busy ? 0.5 : pressed ? 0.8 : 1 },
          ]}>
          <SymbolView
            name={recorder.recording ? { ios: 'stop.fill', web: 'stop' } : { ios: 'mic.fill', web: 'mic' }}
            size={40}
            tintColor={theme.onTint}
          />
        </Pressable>
        <ThemedText themeColor="textSecondary" role="status">
          {recorder.recording
            ? `Recording… ${seconds}s — tap to stop`
            : busy
              ? 'Checking…'
              : recording && recording.durationMs < 300
                ? 'That was very short. Tap and say it again.'
                : 'Tap the microphone and say it.'}
        </ThemedText>
        {busy ? <ActivityIndicator color={theme.tint} /> : null}
      </View>

      {recorder.error ? (
        <ThemedText role="alert" themeColor="danger">
          {recorder.error}
        </ThemedText>
      ) : null}
      {score.isError ? (
        <ThemedText role="alert" themeColor="danger">
          {score.error.message}
        </ThemedText>
      ) : null}
      {score.data && recording ? <Result text={text} result={score.data} recording={recording} /> : null}
    </View>
  );
}

const scoreColor = (s: number): 'success' | 'warning' | 'danger' => (s >= 80 ? 'success' : s >= 60 ? 'warning' : 'danger');

function Result({ text, result, recording }: { text: string; result: PronunciationResult; recording: Recording }) {
  const theme = useTheme();
  const { playingId } = useSpeech();
  const verdict = result.score >= 85 ? 'Excellent!' : result.score >= 70 ? 'Good' : result.score >= 50 ? 'Getting there' : 'Keep practising';
  return (
    <Card>
      <View style={styles.scoreRow}>
        <ThemedText style={[styles.score, { color: theme[scoreColor(result.score)] }]} aria-label={`Score ${result.score} out of 100`}>
          {result.score}
        </ThemedText>
        <View style={styles.flex}>
          <ThemedText type="subtitle">{verdict}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Accuracy {result.accuracy} · Fluency {result.fluency} · Completeness {result.completeness}
          </ThemedText>
        </View>
      </View>

      <View role="list" aria-label="Score per syllable" style={styles.syllables}>
        {result.syllables.map((s, i) => {
          const marked = s.pinyin && s.tone ? numberedSyllableToMarked(`${s.pinyin}${s.tone === 5 ? '' : s.tone}`) : '';
          const color = theme[scoreColor(s.accuracy)];
          return (
            <View
              key={i}
              role="listitem"
              aria-label={`${s.char} ${marked}: ${s.error === 'Omission' ? 'missed' : s.accuracy}`}
              style={[styles.syllable, { borderColor: color }]}>
              <ThemedText lang="zh" style={styles.syllableChar}>
                {s.char}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {marked}
              </ThemedText>
              <ThemedText type="smallBold" style={{ color }}>
                {s.error === 'Omission' ? 'missed' : s.accuracy}
              </ThemedText>
            </View>
          );
        })}
      </View>
      {result.syllables.some((s) => s.accuracy < 60) ? (
        <ThemedText type="small" themeColor="textSecondary">
          Red syllables need work: listen again and compare the pitch below.
        </ThemedText>
      ) : null}
      {result.heard && result.heard.replace(/[。？！，,.?!\s]/g, '') !== text.replace(/[。？！，,.?!\s]/g, '') ? (
        <ThemedText type="small" themeColor="textSecondary">
          It sounded like: {result.heard}
        </ThemedText>
      ) : null}

      <PitchGraph text={text} recording={recording} result={result} />

      <View style={styles.row}>
        <SpeakButton text={text} label="Play the model" size={40} />
        <ThemedText style={styles.flex}>Model</ThemedText>
        <Pressable
          role="button"
          aria-label="Play my recording"
          onPress={() => playRecording(recording.uri)}
          style={[styles.playMine, { backgroundColor: playingId === 'my-recording' ? theme.tint : theme.backgroundElement }]}>
          <SymbolView name={{ ios: 'person.wave.2.fill', web: 'record_voice_over' }} size={20} tintColor={playingId === 'my-recording' ? theme.onTint : theme.tint} />
        </Pressable>
        <ThemedText style={styles.flex}>Me</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {result.left} checks left today.
      </ThemedText>
    </Card>
  );
}

/** Your pitch (color) over the model voice's (grey), each scaled to its own voice range. */
function PitchGraph({ text, recording, result }: { text: string; recording: Recording; result: PronunciationResult }) {
  const theme = useTheme();
  const model = useModelPitch(text);
  const mine = useMemo(() => pitchCurve(trackPitch(recording.samples, 16000)), [recording]);
  const [width, setWidth] = useState(0);
  const height = 140;
  const pad = 14;

  const toPoints = (pts: CurvePoint[]) =>
    pts
      .filter((p) => p.v != null)
      .map((p) => `${pad + p.t * (width - 2 * pad)},${height / 2 - (p.v! * (height - 2 * pad))}`)
      .join(' ');
  const modelPts = (model.data ?? []).map(([t, v]) => ({ t, v }));
  const span = mine.end - mine.start || 1;
  const xOf = (sec: number) => pad + Math.max(0, Math.min(1, (sec - mine.start) / span)) * (width - 2 * pad);

  return (
    <View
      style={[styles.graph, { borderColor: theme.border }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      role="img"
      aria-label="Pitch of your voice compared with the model">
      {width ? (
        <Svg width={width} height={height}>
          <Line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={theme.border} strokeDasharray="4 4" />
          {result.syllables.map((s, i) =>
            s.start != null && i > 0 ? (
              <Line key={`l${i}`} x1={xOf(s.start)} y1={0} x2={xOf(s.start)} y2={height} stroke={theme.border} />
            ) : null,
          )}
          {result.syllables.map((s, i) =>
            s.start != null && s.end != null ? (
              <SvgText key={`t${i}`} x={(xOf(s.start) + xOf(s.end)) / 2} y={14} fontSize={13} fill={theme.textSecondary} textAnchor="middle">
                {s.char}
              </SvgText>
            ) : null,
          )}
          {modelPts.length ? (
            <Polyline points={toPoints(modelPts)} fill="none" stroke={theme.textSecondary} strokeWidth={3} strokeOpacity={0.5} strokeLinecap="round" />
          ) : null}
          {mine.points.length ? (
            <Polyline points={toPoints(mine.points)} fill="none" stroke={theme.tint} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          ) : null}
        </Svg>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary" style={styles.legend}>
        <ThemedText type="smallBold" themeColor="tint">
          ━ you
        </ThemedText>{' '}
        {modelPts.length ? '━ model (grey) · ' : ''}high ↑ low ↓
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.three },
  flex: { flex: 1 },
  prompt: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  zh: { fontSize: 40, lineHeight: 52, fontWeight: 500 },
  center: { alignItems: 'center', gap: Spacing.two },
  mic: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  score: { fontSize: 56, lineHeight: 64, fontWeight: 700 },
  syllables: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  syllable: { alignItems: 'center', borderWidth: 2, borderRadius: Radius.small, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, minWidth: 56 },
  syllableChar: { fontSize: 24, lineHeight: 32 },
  graph: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.small, overflow: 'hidden' },
  legend: { padding: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  playMine: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
