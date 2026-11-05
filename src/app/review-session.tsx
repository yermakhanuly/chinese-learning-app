import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { closeModal } from '@/components/close-button';
import { RubyText } from '@/components/ruby-text';
import { ThemedText } from '@/components/themed-text';
import { Hanzi, Pinyin, SpeakButton } from '@/components/word-parts';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useHydrated } from '@/hooks/use-hydrated';
import { recordReview, useInvalidateReview, useReviewQueue } from '@/hooks/use-review';
import { useTheme } from '@/hooks/use-theme';
import { speakChinese } from '@/lib/speech';
import {
  GRADES,
  answerCard,
  formatInterval,
  fromFsrsCard,
  getScheduler,
  isDeck,
  previewGrades,
  startSession,
  type CustomContent,
  type Grade,
  type ReviewCardRow,
  type SentenceContent,
  type Session,
  type WordContent,
} from '@/lib/srs';
import { useAuth } from '@/providers/auth';

/** /review-session?deck=all — flashcard review: flip, then Again / Hard / Good / Easy. */
export default function ReviewSessionScreen() {
  const theme = useTheme();
  const hydrated = useHydrated();
  const { session: auth } = useAuth();
  const params = useLocalSearchParams<{ deck?: string }>();
  const deck = isDeck(params.deck) ? params.deck : 'all';
  const queue = useReviewQueue(deck, hydrated);
  const scheduler = useQuery({ queryKey: ['fsrs-scheduler'], queryFn: getScheduler, staleTime: Infinity, gcTime: Infinity });

  if (!auth) {
    return (
      <Centered>
        <ThemedText>Log in to review your words.</ThemedText>
        <Button label="Log in" onPress={() => router.replace('/sign-in')} />
      </Centered>
    );
  }
  if (!hydrated || queue.isPending || scheduler.isPending) {
    return (
      <Centered>
        <ActivityIndicator color={theme.tint} />
      </Centered>
    );
  }
  if (queue.isError || scheduler.isError) {
    return (
      <Centered>
        <ThemedText>Couldn&apos;t load your cards. Check your connection.</ThemedText>
        <Button label="Back" variant="secondary" onPress={closeModal} />
      </Centered>
    );
  }
  return <Player cards={queue.data} scheduler={scheduler.data} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.center, { backgroundColor: theme.background }]}>{children}</View>;
}

function Player({ cards, scheduler }: { cards: ReviewCardRow[]; scheduler: Awaited<ReturnType<typeof getScheduler>> }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<Session>(() => startSession(cards));
  const [flipped, setFlipped] = useState(false);
  const [failed, setFailed] = useState(0);
  // Answers still being saved (one list for the whole session).
  const [saving] = useState<Promise<unknown>[]>(() => []);
  const total = cards.length;

  const card = session.queue[0];
  if (!card) return <Summary session={session} failed={failed} saving={saving} />;

  const now = new Date();
  const next = flipped ? previewGrades(scheduler, card, now) : null;

  function rate(grade: Grade) {
    if (!next) return;
    const updated = next[grade];
    saving.push(recordReview(card.id, grade, updated).catch(() => setFailed((n) => n + 1)));
    setSession((s) => answerCard(s, grade, fromFsrsCard(updated), new Date()));
    setFlipped(false);
  }

  const remaining = session.queue.length;
  const progress = total ? Math.min(1, session.seen.length / total) : 1;
  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top + Spacing.two }]}>
      <View style={styles.topBar}>
        <Pressable role="button" aria-label="Close review" onPress={closeModal} hitSlop={12}>
          <SymbolView name={{ ios: 'xmark', web: 'close' }} size={22} tintColor={theme.textSecondary} />
        </Pressable>
        <View
          role="progressbar"
          aria-label="Review progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
          <View style={[styles.fill, { backgroundColor: theme.tint, width: `${progress * 100}%` }]} />
        </View>
        <ThemedText type="smallBold" themeColor="textSecondary" aria-label={`${remaining} cards left`}>
          {remaining}
        </ThemedText>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.body}>
        {/* Keyed so each card (and each repeat) mounts fresh, e.g. to play its audio. */}
        <View key={`${card.id}-${session.done}`} style={[styles.inner, styles.card, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold" themeColor="tint">
            {cardLabel(card)}
          </ThemedText>
          <CardFace card={card} flipped={flipped} />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three, borderTopColor: theme.border }]}>
        <View style={styles.inner}>
          {failed ? (
            <ThemedText type="small" themeColor="danger" role="alert">
              Some answers couldn&apos;t be saved. Check your connection.
            </ThemedText>
          ) : null}
          {!next ? (
            <Button label="Show answer" onPress={() => setFlipped(true)} />
          ) : (
            <View role="group" aria-label="How well did you remember?" style={styles.grades}>
              {GRADES.map(({ grade, label }) => {
                const when = formatInterval(now, new Date(next[grade].dueAt));
                return (
                  <Pressable
                    key={grade}
                    role="button"
                    aria-label={`${label}, next review in ${when}`}
                    onPress={() => rate(grade)}
                    style={({ pressed }) => [
                      styles.grade,
                      { borderColor: grade === 1 ? theme.danger : grade === 3 ? theme.tint : theme.border },
                      { backgroundColor: pressed ? theme.backgroundSelected : theme.background },
                    ]}>
                    <ThemedText type="label" themeColor={grade === 1 ? 'danger' : 'text'}>
                      {label}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {when}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function cardLabel(card: ReviewCardRow): string {
  const repeat = card.state === 0 ? 'NEW' : card.state === 1 || card.state === 3 ? 'AGAIN' : 'REVIEW';
  const what =
    card.kind === 'custom'
      ? 'MY CARD'
      : card.direction === 'listen'
        ? 'LISTEN'
        : card.direction === 'recall'
          ? 'SAY IT IN CHINESE'
          : card.kind === 'sentence'
            ? 'SENTENCE'
            : 'WHAT DOES IT MEAN?';
  return `${repeat} · ${what}`;
}

/** Plays `text` once when the card appears (listen cards) or when it's flipped (others). */
function useAutoplay(text: string | null, when: boolean) {
  const played = useRef(false);
  useEffect(() => {
    if (text && when && !played.current) {
      played.current = true;
      speakChinese(text);
    }
  }, [text, when]);
}

function CardFace({ card, flipped }: { card: ReviewCardRow; flipped: boolean }) {
  if (card.kind === 'word') return <WordFace content={card.content as WordContent} direction={card.direction} flipped={flipped} />;
  if (card.kind === 'sentence') return <SentenceFace content={card.content as SentenceContent} direction={card.direction} flipped={flipped} />;
  return <CustomFace content={card.content as CustomContent} flipped={flipped} />;
}

function Meanings({ meanings }: { meanings: string[] }) {
  return (
    <View style={styles.meanings}>
      {meanings.map((m, i) => (
        <ThemedText key={i} type={i === 0 ? 'subtitle' : 'default'} style={styles.centerText}>
          {m}
        </ThemedText>
      ))}
    </View>
  );
}

function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

function WordFace({ content, direction, flipped }: { content: WordContent; direction: ReviewCardRow['direction']; flipped: boolean }) {
  useAutoplay(content.simplified, direction === 'listen' || flipped);
  const word = <Hanzi simplified={content.simplified} traditional={content.traditional} size={64} />;
  const audio = <SpeakButton text={content.simplified} label="Play" size={direction === 'listen' && !flipped ? 88 : 44} />;
  const front =
    direction === 'read' ? word : direction === 'listen' ? audio : <Meanings meanings={content.meanings} />;
  return (
    <View style={styles.face}>
      {front}
      {flipped ? (
        <>
          <Divider />
          {direction !== 'read' ? word : null}
          {content.pinyin ? <Pinyin text={content.pinyin} size={22} /> : null}
          {direction !== 'recall' ? <Meanings meanings={content.meanings} /> : null}
          {direction !== 'listen' ? audio : null}
        </>
      ) : direction === 'listen' ? (
        <ThemedText themeColor="textSecondary">What does it mean? Tap to listen again.</ThemedText>
      ) : null}
    </View>
  );
}

function SentenceFace({ content, direction, flipped }: { content: SentenceContent; direction: ReviewCardRow['direction']; flipped: boolean }) {
  useAutoplay(content.simplified, direction === 'listen' || flipped);
  const text = <RubyText tokens={content.tokens} size={26} />;
  const audio = <SpeakButton text={content.simplified} label="Play sentence" size={direction === 'listen' && !flipped ? 88 : 44} />;
  return (
    <View style={styles.face}>
      {direction === 'listen' ? audio : text}
      {flipped ? (
        <>
          <Divider />
          {direction === 'listen' ? text : null}
          <ThemedText type="subtitle" style={styles.centerText}>
            {content.english}
          </ThemedText>
          {direction !== 'listen' ? audio : null}
        </>
      ) : (
        <ThemedText themeColor="textSecondary">What does it mean?</ThemedText>
      )}
    </View>
  );
}

function CustomFace({ content, flipped }: { content: CustomContent; flipped: boolean }) {
  useAutoplay(content.zh, flipped);
  return (
    <View style={styles.face}>
      <ThemedText type="title" style={styles.centerText}>
        {content.front}
      </ThemedText>
      {flipped ? (
        <>
          <Divider />
          <ThemedText type="subtitle" style={styles.centerText}>
            {content.back}
          </ThemedText>
          {content.zh ? <SpeakButton text={content.zh} label="Play" size={44} /> : null}
        </>
      ) : null}
    </View>
  );
}

function Summary({ session, failed, saving }: { session: Session; failed: number; saving: Promise<unknown>[] }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const invalidate = useInvalidateReview();
  const reviewed = session.seen.length;
  // Wait for every answer to reach the server, then refresh counts on the Review tab and Home.
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.allSettled(saving)
      .then(invalidate)
      .then(() => active && setSaved(true));
    return () => {
      active = false;
    };
    // Runs once: `saving` is fixed by now and `invalidate` is a fresh function each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const remembered = session.counts[2] + session.counts[3] + session.counts[4];
  return (
    <View style={[styles.center, { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={[styles.inner, styles.summary]}>
        <ThemedText style={styles.trophy}>{reviewed ? '✅' : '🌱'}</ThemedText>
        <ThemedText type="title" style={styles.centerText}>
          {reviewed ? 'Review done!' : 'Nothing to review'}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centerText}>
          {reviewed
            ? `${reviewed} ${reviewed === 1 ? 'card' : 'cards'} · remembered ${remembered} · again ${session.counts[1]}`
            : 'No cards are due in this deck right now. Finish a lesson or save words to add more.'}
        </ThemedText>
        {failed ? (
          <ThemedText themeColor="danger" role="alert" style={styles.centerText}>
            {failed} {failed === 1 ? 'answer was' : 'answers were'} not saved. Check your connection.
          </ThemedText>
        ) : reviewed ? (
          <ThemedText type="small" themeColor="textSecondary" role="status" style={styles.centerText}>
            {saved ? 'All answers saved.' : 'Saving your answers…'}
          </ThemedText>
        ) : null}
        <Button label="Done" onPress={closeModal} loading={!saved} style={styles.wide} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.three },
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
  track: { flex: 1, height: 12, borderRadius: Radius.small, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.small },
  body: { padding: Spacing.three, alignItems: 'center', flexGrow: 1, justifyContent: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.large, padding: Spacing.four, minHeight: 280 },
  face: { alignItems: 'center', gap: Spacing.three },
  meanings: { alignItems: 'center', gap: Spacing.one },
  divider: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: Spacing.one },
  centerText: { textAlign: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.three, paddingHorizontal: Spacing.three, alignItems: 'center' },
  grades: { flexDirection: 'row', gap: Spacing.two },
  grade: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.two,
    minHeight: 56,
    justifyContent: 'center',
  },
  summary: { alignItems: 'center' },
  trophy: { fontSize: 64, lineHeight: 80 },
  wide: { alignSelf: 'stretch', marginTop: Spacing.three },
});
