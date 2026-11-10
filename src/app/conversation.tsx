import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ChineseLine, CorrectionNote, FeedbackCard, HoldToTalk, PremiumGate, Toggle } from '@/components/tutor/tutor-parts';
import { Radius, Spacing } from '@/constants/theme';
import { useHydrated } from '@/hooks/use-hydrated';
import {
  useConversation,
  useFinishConversation,
  useScenarios,
  useSendMessage,
  useStartConversation,
  useVoiceMessage,
} from '@/hooks/use-tutor';
import { useTheme } from '@/hooks/use-theme';
import { LIMIT_MESSAGE, corrections, goalsDone, readingPinyin, type TutorMessage } from '@/lib/tutor';

/** One conversation with the AI tutor: tutor chat, role-play or free conversation. */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const hydrated = useHydrated();
  return (
    <>
      <Stack.Screen options={{ title: 'Conversation' }} />
      <Screen stacked>
        <PremiumGate feature="The AI tutor">{hydrated && id ? <Chat id={id} /> : <ActivityIndicator />}</PremiumGate>
      </Screen>
    </>
  );
}

function Chat({ id }: { id: string }) {
  const theme = useTheme();
  const { data, isPending, isError } = useConversation(id);
  const scenario = useScenarios().data?.find((s) => s.id === data?.conversation.scenario_id);
  const send = useSendMessage(id);
  const voice = useVoiceMessage(id);
  const finish = useFinishConversation(id);
  const again = useStartConversation();
  const [draft, setDraft] = useState('');
  const [showPinyin, setShowPinyin] = useState(true);
  const [showEnglish, setShowEnglish] = useState(false);
  const [showPhrases, setShowPhrases] = useState(false);

  if (isPending) return <ActivityIndicator />;
  if (isError || !data) return <ThemedText themeColor="danger">Couldn&apos;t open this conversation.</ThemedText>;
  const { conversation: c, messages } = data;
  const tutorMode = c.mode === 'tutor';
  const busy = send.isPending || voice.isPending || finish.isPending;
  const finished = !!c.finished_at;
  const done = scenario ? goalsDone(messages, scenario.goals.length) : new Set<number>();
  const fixed = corrections(messages).map((m) => ({ said: m.text, correction: m.data.correction }));
  const error = send.error ?? voice.error ?? finish.error ?? again.error;

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    send.mutate(text, { onSuccess: () => setDraft('') });
  };

  return (
    <View style={styles.gap}>
      <View style={styles.headerRow}>
        <ThemedText type="subtitle" style={styles.flex}>
          {scenario ? `${scenario.emoji} ${c.title}` : c.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          HSK {c.level}
        </ThemedText>
      </View>

      {scenario ? (
        <Card>
          <ThemedText themeColor="textSecondary">
            {scenario.setting} You are {scenario.learner_role}.
          </ThemedText>
          <View role="list" aria-label="Goals" style={styles.gapSmall}>
            {scenario.goals.map((g, i) => (
              <ThemedText key={g} role="listitem" aria-label={`${g}${done.has(i) ? ', done' : ''}`} themeColor={done.has(i) ? 'success' : 'text'}>
                {done.has(i) ? '✅' : '⬜️'} {g}
              </ThemedText>
            ))}
          </View>
          <ThemedText type="link" role="button" aria-expanded={showPhrases} onPress={() => setShowPhrases((v) => !v)}>
            {showPhrases ? 'Hide useful phrases' : 'Useful phrases'}
          </ThemedText>
          {showPhrases
            ? scenario.phrases.map((p) => (
                <ChineseLine
                  key={p.zh}
                  id={`phrase-${p.zh}`}
                  zh={p.zh}
                  pinyin={readingPinyin(scenario.readings[p.zh])}
                  en={p.en}
                  voice={scenario.voice}
                  showPinyin
                  showEnglish
                  size={18}
                />
              ))
            : null}
        </Card>
      ) : null}

      {!tutorMode ? (
        <View style={styles.toggles}>
          <Toggle label="Pinyin" value={showPinyin} onChange={setShowPinyin} />
          <Toggle label="English" value={showEnglish} onChange={setShowEnglish} />
        </View>
      ) : null}

      <View role="list" aria-label="Messages" style={styles.messages}>
        {messages.map((m) => (
          <Bubble key={m.id} m={m} tutorMode={tutorMode} voice={scenario?.voice} showPinyin={showPinyin} showEnglish={showEnglish} />
        ))}
        {busy && !finish.isPending ? (
          <View style={[styles.bubble, styles.theirs, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ActivityIndicator color={theme.tint} aria-label="The tutor is replying" />
          </View>
        ) : null}
      </View>

      {error ? (
        <ThemedText role="alert" themeColor="danger">
          {error.message}
        </ThemedText>
      ) : null}

      {finished ? (
        <>
          {c.feedback ? <FeedbackCard feedback={c.feedback} mistakes={fixed} /> : null}
          <Button
            label="Practise again"
            loading={again.isPending}
            onPress={() =>
              again.mutate(
                { mode: c.mode, scenario_id: c.scenario_id ?? undefined, topic: c.topic ?? undefined },
                { onSuccess: ({ conversation }) => router.replace({ pathname: '/conversation', params: { id: conversation.id } }) },
              )
            }
          />
        </>
      ) : (
        <Card>
          <View style={styles.inputRow}>
            <TextInput
              aria-label={tutorMode ? 'Your question' : 'Your message in Chinese'}
              placeholder={tutorMode ? 'Ask anything about Chinese…' : '用中文说…  (type in Chinese)'}
              placeholderTextColor={theme.textSecondary}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={submit}
              maxLength={LIMIT_MESSAGE}
              multiline={tutorMode}
              editable={!busy}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
            />
            <Button label="Send" onPress={submit} disabled={!draft.trim() || busy} />
          </View>
          {!tutorMode ? (
            <>
              <HoldToTalk disabled={busy} onRecorded={(wav) => voice.mutate(wav)} />
              {voice.data?.heard ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                  Heard: {voice.data.heard}
                </ThemedText>
              ) : null}
              <Button
                label={finish.isPending ? 'Writing your feedback…' : 'Finish and get feedback'}
                variant="secondary"
                disabled={busy || !messages.some((m) => m.role === 'user')}
                onPress={() => finish.mutate()}
              />
            </>
          ) : null}
        </Card>
      )}
    </View>
  );
}

function Bubble({
  m,
  tutorMode,
  voice,
  showPinyin,
  showEnglish,
}: {
  m: TutorMessage;
  tutorMode: boolean;
  voice?: 'female' | 'male';
  showPinyin: boolean;
  showEnglish: boolean;
}) {
  const theme = useTheme();
  const mine = m.role === 'user';
  return (
    <View
      role="listitem"
      aria-label={mine ? `You${m.data.voice ? ' (spoken)' : ''}: ${m.text}` : `Tutor: ${m.text}`}
      style={[
        styles.bubble,
        mine ? styles.mine : styles.theirs,
        { backgroundColor: mine ? theme.backgroundSelected : theme.backgroundElement, borderColor: theme.border },
      ]}>
      {mine ? (
        <>
          <ThemedText lang={tutorMode ? undefined : 'zh'} style={tutorMode ? undefined : styles.mineZh}>
            {m.data.voice ? '🎤 ' : ''}
            {m.text}
          </ThemedText>
          {m.data.correction ? <CorrectionNote correction={m.data.correction} showPinyin={showPinyin} /> : null}
        </>
      ) : tutorMode ? (
        <ThemedText>{m.text}</ThemedText>
      ) : (
        <ChineseLine id={`tutor-${m.id}`} zh={m.text} pinyin={m.data.pinyin} en={m.data.en} voice={voice} showPinyin={showPinyin} showEnglish={showEnglish} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.three },
  gapSmall: { gap: Spacing.one },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  toggles: { flexDirection: 'row', gap: Spacing.two },
  messages: { gap: Spacing.two },
  bubble: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three, gap: Spacing.two, maxWidth: '92%' },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  mineZh: { fontSize: 18, lineHeight: 26 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  input: { flex: 1, minHeight: 48, maxHeight: 140, borderWidth: 1, borderRadius: Radius.small + 2, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 17 },
});
