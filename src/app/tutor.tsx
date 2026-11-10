import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LinkRow } from '@/components/progress/progress-parts';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { PremiumGate } from '@/components/tutor/tutor-parts';
import { Radius, Spacing } from '@/constants/theme';
import { useConversations, useDeleteConversation, useScenarios, useStartConversation, type ScenarioRow } from '@/hooks/use-tutor';
import { useTheme } from '@/hooks/use-theme';
import type { TutorMode } from '@/lib/tutor';

const TOPICS = ['Family', 'Food', 'Hobbies', 'Weekend', 'Travel', 'Work and study', 'The weather', 'Shopping'];

/** AI tutor hub (Premium): ask the tutor, role-plays, free conversation, sentence tools, history. */
export default function TutorScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'AI tutor' }} />
      <Screen stacked>
        <PremiumGate feature="The AI tutor">
          <TutorHub />
        </PremiumGate>
      </Screen>
    </>
  );
}

function TutorHub() {
  const start = useStartConversation();
  const [topic, setTopic] = useState('');

  const open = (body: { mode: TutorMode; scenario_id?: string; topic?: string }) =>
    start.mutate(body, { onSuccess: ({ conversation }) => router.push({ pathname: '/conversation', params: { id: conversation.id } }) });

  return (
    <View style={styles.gap}>
      {start.isError ? (
        <ThemedText role="alert" themeColor="danger">
          {start.error.message}
        </ThemedText>
      ) : null}
      <Card title="💬 Ask the tutor">
        <ThemedText themeColor="textSecondary">
          Questions about words, grammar, characters or how to say something. Answers in English, with examples at your
          level.
        </ThemedText>
        <Button label="Ask a question" loading={start.isPending && start.variables?.mode === 'tutor'} onPress={() => open({ mode: 'tutor' })} />
      </Card>

      <Scenarios onStart={(id) => open({ mode: 'roleplay', scenario_id: id })} starting={start.isPending ? start.variables?.scenario_id : undefined} />

      <Card title="🗣 Free conversation">
        <ThemedText themeColor="textSecondary">Chat in Chinese with 小林 about anything. Every message is corrected.</ThemedText>
        <View style={styles.chips}>
          {TOPICS.map((t) => (
            <Chip key={t} label={t} onPress={() => open({ mode: 'free', topic: t })} />
          ))}
        </View>
        <TextField label="Or your own topic" value={topic} onChangeText={setTopic} maxLength={80} placeholder="e.g. My favourite film" />
        <Button
          label="Start talking"
          variant="secondary"
          disabled={!topic.trim()}
          loading={start.isPending && start.variables?.mode === 'free'}
          onPress={() => open({ mode: 'free', topic: topic.trim() })}
        />
      </Card>

      <Card title="🧰 Tools">
        <LinkRow label="Check my sentence" detail="Corrections + why" onPress={() => router.push({ pathname: '/ai-tools', params: { tool: 'check' } })} />
        <LinkRow label="Explain a sentence" detail="Word by word" onPress={() => router.push({ pathname: '/ai-tools', params: { tool: 'explain' } })} />
        <LinkRow label="Quiz me on recent words" detail="New every time" onPress={() => router.push('/ai-quiz')} />
      </Card>

      <History />
    </View>
  );
}

function Scenarios({ onStart, starting }: { onStart: (id: string) => void; starting?: string }) {
  const theme = useTheme();
  const { data, isPending, isError } = useScenarios();
  if (isPending) return <ActivityIndicator />;
  if (isError) return <ThemedText themeColor="danger">Couldn&apos;t load the role-plays. Check your connection.</ThemedText>;
  const levels = [...new Set(data.map((s) => s.hsk_level))];
  return (
    <Card title="🎭 Role-plays">
      <ThemedText themeColor="textSecondary">Real situations with goals to reach. The tutor plays the other person.</ThemedText>
      {levels.map((lv) => (
        <View key={lv} style={styles.gapSmall}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            HSK {lv}
          </ThemedText>
          <View role="list" style={styles.gapSmall}>
            {data
              .filter((s) => s.hsk_level === lv)
              .map((s) => (
                <ScenarioRowView key={s.id} s={s} loading={starting === s.id} onPress={() => onStart(s.id)} border={theme.border} />
              ))}
          </View>
        </View>
      ))}
    </Card>
  );
}

function ScenarioRowView({ s, onPress, loading, border }: { s: ScenarioRow; onPress: () => void; loading: boolean; border: string }) {
  const theme = useTheme();
  return (
    <Pressable
      role="button"
      aria-label={`Role-play: ${s.title}`}
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [styles.scenario, { borderColor: border, backgroundColor: pressed ? theme.backgroundSelected : theme.background }]}>
      <ThemedText style={styles.emoji}>{s.emoji}</ThemedText>
      <View style={styles.flex}>
        <ThemedText type="label">{s.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {s.setting}
        </ThemedText>
      </View>
      {loading ? <ActivityIndicator color={theme.tint} /> : <ThemedText themeColor="textSecondary">›</ThemedText>}
    </Pressable>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      role="button"
      aria-label={`Talk about ${label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : theme.background }]}>
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

const MODE_LABEL = { tutor: '💬', roleplay: '🎭', free: '🗣' } as const;

function History() {
  const { data } = useConversations();
  const remove = useDeleteConversation();
  if (!data?.length) return null;
  return (
    <Card title="Past conversations">
      <View role="list" style={styles.gapSmall}>
        {data.map((c) => (
          <View key={c.id} role="listitem" style={styles.row}>
            <View style={styles.flex}>
              <LinkRow
                label={`${MODE_LABEL[c.mode]} ${c.title}`}
                detail={c.feedback ? `${c.feedback.score}/100` : c.finished_at ? 'Finished' : new Date(c.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                onPress={() => router.push({ pathname: '/conversation', params: { id: c.id } })}
              />
            </View>
            <ThemedText type="link" role="button" aria-label={`Delete ${c.title}`} onPress={() => remove.mutate(c.id)}>
              Delete
            </ThemedText>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.three },
  gapSmall: { gap: Spacing.two },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: Radius.small, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  scenario: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.medium,
    padding: Spacing.three,
  },
  emoji: { fontSize: 28, lineHeight: 34 },
});
