import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { courseQuery, lessonQuery, saveLesson, type LessonContent } from '@/hooks/use-course';
import { fetchReviewQueue, sendQueuedReview } from '@/hooks/use-review';
import { useTheme } from '@/hooks/use-theme';
import { audioKey } from '@/lib/audio-key';
import { deleteDownloadedClips, downloadClips, downloadedClips } from '@/lib/audio-files';
import { flushOutbox, onSynced, readCopy, saveCopy, setOutboxSender, useOfflineState } from '@/lib/offline';
import { clipUrl, hasClip } from '@/lib/speech';
import { useAuth } from '@/providers/auth';

/** Mounted once (root layout): sends answers given offline when the app is online again. */
export function OfflineSync() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  useEffect(() => {
    setOutboxSender(async (item) => {
      if (item.type === 'review') await sendQueuedReview(item.cardId, item.grade, item.card, item.at);
      else await saveLesson(item.lessonId, item.score, item.missed, item.at);
    });
    const off = onSynced(() => void queryClient.invalidateQueries());
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void flushOutbox();
    });
    return () => {
      off();
      sub.remove();
    };
  }, [queryClient]);
  // Signed in (or the session restored): try straight away.
  useEffect(() => {
    if (session) void flushOutbox();
  }, [session]);
  return null;
}

/** "You're offline" / "N answers waiting to sync". */
export function OfflineBanner() {
  const theme = useTheme();
  const { online, waiting } = useOfflineState();
  if (online && !waiting) return null;
  return (
    <View role="status" style={[styles.banner, { borderColor: online ? theme.tint : theme.warning, backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold" themeColor={online ? 'tint' : 'warning'}>
        {online ? '⟳ Syncing…' : '✈︎ You’re offline'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {online
          ? `Sending ${waiting} ${waiting === 1 ? 'answer' : 'answers'} from offline study.`
          : `Downloaded lessons and today's reviews still work.${waiting ? ` ${waiting} ${waiting === 1 ? 'answer' : 'answers'} will be sent when you're back online.` : ''}`}
      </ThemedText>
    </View>
  );
}

type Downloaded = { level: number; lessons: number; at: string };

/** Profile (iPhone): download a level's lessons, their audio and today's reviews for offline study. */
export function OfflineDownloads() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [state, setState] = useState<{ step: string; done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Downloaded | undefined>(() => readCopy<Downloaded>('downloaded:1'));
  const [clips, setClips] = useState(() => downloadedClips());

  async function download(level: number) {
    setError(null);
    try {
      setState({ step: 'Lessons', done: 0, total: 1 });
      const units = await queryClient.fetchQuery(courseQuery(level));
      const ids = units.flatMap((u) => u.lessons.map((l) => l.id));
      const lessons: LessonContent[] = [];
      for (const [i, id] of ids.entries()) {
        const l = await queryClient.fetchQuery({ ...lessonQuery(id), staleTime: 0 });
        if (l) lessons.push(l);
        setState({ step: 'Lessons', done: i + 1, total: ids.length });
      }
      if (session) {
        setState({ step: "Today's reviews", done: 0, total: 1 });
        await fetchReviewQueue(session.user.id, 'all');
      }
      // Audio for every Chinese text in the lessons, and each new word's example sentence.
      const texts = new Set<string>();
      for (const l of lessons) {
        Object.keys(l.readings).forEach((t) => texts.add(t));
        Object.values(l.word_details).forEach((w) => w.example && texts.add(w.example.simplified));
        l.words.forEach((w) => texts.add(w));
      }
      const withClips: string[] = [];
      for (const t of texts) if (await hasClip(t)) withClips.push(t);
      const { failed } = await downloadClips(
        withClips.map((t) => ({ key: audioKey(t), url: clipUrl(t) })),
        (done, total) => setState({ step: 'Audio', done, total }),
      );
      const record = { level, lessons: lessons.length, at: new Date().toISOString() };
      saveCopy(`downloaded:${level}`, record);
      setSaved(record);
      setClips(downloadedClips());
      if (failed) setError(`${failed} audio clips couldn't be downloaded; they play from the internet instead.`);
    } catch {
      setError("Couldn't finish the download. Check your connection and try again (it continues where it stopped).");
    } finally {
      setState(null);
    }
  }

  if (process.env.EXPO_OS === 'web') return null;
  return (
    <Card title="Offline study">
      <ThemedText themeColor="textSecondary">
        Download the HSK 1 lessons, their audio and today&apos;s reviews to study without internet (on a plane, say). Answers
        are sent when you&apos;re back online. The AI tutor and dictionary search need a connection.
      </ThemedText>
      {saved ? (
        <ThemedText type="small" themeColor="success">
          ✓ HSK 1: {saved.lessons} lessons downloaded {new Date(saved.at).toLocaleDateString()} · {clips.count} audio clips (
          {(clips.bytes / 1e6).toFixed(1)} MB)
        </ThemedText>
      ) : null}
      {state ? (
        <ThemedText role="status" themeColor="textSecondary">
          {state.step}: {state.done} / {state.total}
        </ThemedText>
      ) : null}
      {error ? (
        <ThemedText role="alert" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
      <Button label={saved ? 'Update the download' : 'Download HSK 1'} loading={!!state} onPress={() => download(1)} />
      {clips.count ? (
        <Button
          label="Remove downloaded audio"
          variant="ghost"
          disabled={!!state}
          onPress={() => {
            deleteDownloadedClips();
            setClips(downloadedClips());
          }}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: Radius.medium, padding: Spacing.three, gap: Spacing.half },
});
