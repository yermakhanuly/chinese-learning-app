import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ChineseLine, PremiumGate } from '@/components/tutor/tutor-parts';
import { Pinyin } from '@/components/word-parts';
import { Spacing } from '@/constants/theme';
import { useHydrated } from '@/hooks/use-hydrated';
import { useCheckSentence, useExplainSentence } from '@/hooks/use-tutor';
import { LIMIT_SENTENCE, type SentenceBreakdown, type SentenceCheck } from '@/lib/tutor';

type Tool = 'check' | 'explain';

/** "Check my sentence" and "Explain a sentence" (Premium). */
export default function AiToolsScreen() {
  const params = useLocalSearchParams<{ tool?: string; text?: string }>();
  const hydrated = useHydrated();
  return (
    <>
      <Stack.Screen options={{ title: 'Sentence tools' }} />
      <Screen stacked>
        <PremiumGate feature="Sentence tools">
          {hydrated ? <Tools key={params.tool} initial={params.tool === 'explain' ? 'explain' : 'check'} text={params.text} /> : <ActivityIndicator />}
        </PremiumGate>
      </Screen>
    </>
  );
}

function Tools({ initial, text }: { initial: Tool; text?: string }) {
  const [tool, setTool] = useState<Tool>(initial);
  const [draft, setDraft] = useState(text ?? '');
  const check = useCheckSentence();
  const explain = useExplainSentence();
  const current = tool === 'check' ? check : explain;

  const run = () => {
    const t = draft.trim();
    if (!t) return;
    if (tool === 'check') check.mutate(t);
    else explain.mutate(t);
  };

  return (
    <View style={styles.gap}>
      <SegmentedControl
        label="Tool"
        options={[
          { value: 'check', label: 'Check my sentence' },
          { value: 'explain', label: 'Explain a sentence' },
        ]}
        value={tool}
        onChange={setTool}
      />
      <Card>
        <TextField
          label={tool === 'check' ? 'Your sentence in Chinese' : 'A Chinese sentence'}
          hint={tool === 'check' ? 'Write a sentence; the tutor corrects it and explains why.' : 'Paste a sentence you don’t understand.'}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={run}
          maxLength={LIMIT_SENTENCE}
          placeholder={tool === 'check' ? '我昨天去了商店买东西。' : '他每天早上七点起床。'}
        />
        <Button label={tool === 'check' ? 'Check' : 'Explain'} onPress={run} loading={current.isPending} disabled={!draft.trim()} />
        {current.isError ? (
          <ThemedText role="alert" themeColor="danger">
            {current.error.message}
          </ThemedText>
        ) : null}
      </Card>
      {tool === 'check' && check.data ? <CheckResult r={check.data} /> : null}
      {tool === 'explain' && explain.data ? <Breakdown r={explain.data} /> : null}
    </View>
  );
}

function CheckResult({ r }: { r: SentenceCheck }) {
  return (
    <Card title={r.ok ? '✓ Correct!' : '✎ Corrected'}>
      <ChineseLine id={`check-${r.corrected}`} zh={r.corrected} pinyin={r.corrected_pinyin} en={r.translation} showPinyin showEnglish />
      <ThemedText>{r.explanation}</ThemedText>
      {r.fixes.map((f, i) => (
        <View key={i} style={styles.fix}>
          <ThemedText lang="zh">
            <ThemedText lang="zh" themeColor="danger" style={styles.strike}>
              {f.wrong}
            </ThemedText>
            {'  →  '}
            <ThemedText lang="zh" themeColor="success">
              {f.right}
            </ThemedText>
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {f.why}
          </ThemedText>
        </View>
      ))}
      {r.natural ? (
        <View style={styles.gapSmall}>
          <ThemedText type="smallBold">More natural</ThemedText>
          <ChineseLine id={`natural-${r.natural}`} zh={r.natural} showPinyin={false} showEnglish={false} size={18} />
        </View>
      ) : null}
    </Card>
  );
}

function Breakdown({ r }: { r: SentenceBreakdown }) {
  return (
    <>
      <Card title="Meaning">
        <ThemedText>{r.translation}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Word for word: {r.literal}
        </ThemedText>
      </Card>
      <Card title="Word by word">
        <View role="list" style={styles.gapSmall}>
          {r.words.map((w, i) => (
            <View key={i} role="listitem" aria-label={`${w.zh}: ${w.meaning}`} style={styles.word}>
              <View style={styles.wordZh}>
                <ThemedText lang="zh" style={styles.zh}>
                  {w.zh}
                </ThemedText>
                <Pinyin text={w.pinyin} size={14} />
              </View>
              <View style={styles.flex}>
                <ThemedText>{w.meaning}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {w.role}
                </ThemedText>
              </View>
            </View>
          ))}
        </View>
      </Card>
      {r.grammar.length ? (
        <Card title="Grammar">
          {r.grammar.map((g, i) => (
            <View key={i} style={styles.gapSmall}>
              <ThemedText type="smallBold">{g.pattern}</ThemedText>
              <ThemedText themeColor="textSecondary">{g.explanation}</ThemedText>
            </View>
          ))}
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.three },
  gapSmall: { gap: Spacing.one },
  flex: { flex: 1 },
  fix: { gap: Spacing.half },
  strike: { textDecorationLine: 'line-through' },
  word: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  wordZh: { width: 96, gap: Spacing.half },
  zh: { fontSize: 20, lineHeight: 28 },
});
