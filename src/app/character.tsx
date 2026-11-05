import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { StrokeOrder, WritingPad, type WritingMode } from '@/components/character/character-svg';
import { CharacterChip } from '@/components/character/character-chip';
import { PinyinToggle } from '@/components/dictionary-controls';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { WordList } from '@/components/word-row';
import { Pinyin, SpeakButton } from '@/components/word-parts';
import { Spacing } from '@/constants/theme';
import { useCharacter, useWordsWithCharacter, useWritingCard, type CharacterInfo } from '@/hooks/use-characters';
import { useHydrated } from '@/hooks/use-hydrated';
import { etymologyText, partsOf } from '@/lib/characters';
import { isHan } from '@/lib/sentences';
import { useAuth } from '@/providers/auth';
import { useDisplayPreferences } from '@/providers/display-preferences';

const MODES: { value: WritingMode; label: string }[] = [
  { value: 'trace', label: 'Trace' },
  { value: 'write', label: 'Write' },
  { value: 'memory', label: 'From memory' },
];

/** /character?c=好 — stroke order, parts, origin, words, and writing practice. */
export default function CharacterScreen() {
  const hydrated = useHydrated();
  const { c } = useLocalSearchParams<{ c?: string }>();
  const character = c && [...c].length === 1 && isHan(c) ? c : undefined;
  const query = useCharacter(hydrated ? character : undefined);

  return (
    <>
      <Stack.Screen options={{ title: character ?? 'Character', headerRight: () => <PinyinToggle /> }} />
      <Screen stacked>
        {!hydrated || (character && query.isPending) ? (
          <ActivityIndicator style={styles.loading} />
        ) : query.isError ? (
          <Card title="Couldn't load this character">
            <ThemedText themeColor="textSecondary">Check your connection and try again.</ThemedText>
          </Card>
        ) : !query.data ? (
          <Card title="No stroke data">
            <ThemedText themeColor="textSecondary">
              {character ? `“${character}” isn't in our character data yet.` : 'Open a character from a word page.'}
            </ThemedText>
          </Card>
        ) : (
          <Details info={query.data} />
        )}
      </Screen>
    </>
  );
}

function Details({ info }: { info: CharacterInfo }) {
  const { showPinyin } = useDisplayPreferences();
  const origin = etymologyText(info.etymology);
  const parts = partsOf(info.decomposition, info.character);
  const words = useWordsWithCharacter(info.character);

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.flex}>
          <ThemedText lang="zh" style={styles.big}>
            {info.character}
          </ThemedText>
          {showPinyin && info.pinyin.length ? <Pinyin text={info.pinyin.join(', ')} size={22} /> : null}
          {info.definition ? <ThemedText>{info.definition}</ThemedText> : null}
        </View>
        <SpeakButton text={info.character} label={`Play ${info.character}`} size={52} />
      </View>

      <Card title="Stroke order">
        <StrokeOrder character={info.character} data={info} />
      </Card>

      <Card title="About this character">
        <Fact label="Strokes">
          <ThemedText>{info.stroke_count}</ThemedText>
        </Fact>
        {info.radical ? (
          <Fact label="Radical">
            <CharacterChip character={info.radical} />
          </Fact>
        ) : null}
        {parts.length ? (
          <Fact label="Parts">
            {parts.map((p) => (
              <CharacterChip key={p} character={p} />
            ))}
          </Fact>
        ) : null}
        {origin ? (
          <Fact label="Origin">
            <ThemedText style={styles.flex}>{origin}</ThemedText>
          </Fact>
        ) : null}
        {info.hsk_level ? (
          <ThemedText type="small" themeColor="textSecondary">
            First used in HSK {info.hsk_level === 7 ? '7–9' : info.hsk_level} words.
          </ThemedText>
        ) : null}
      </Card>

      <Practice info={info} />

      <Card title="Words with this character">
        {words.isPending ? (
          <ActivityIndicator />
        ) : words.data?.length ? (
          <WordList words={words.data} />
        ) : (
          <ThemedText themeColor="textSecondary">No HSK words use it.</ThemedText>
        )}
      </Card>

      <ThemedText type="small" themeColor="textSecondary">
        Stroke data: Make Me a Hanzi (Arphic Public License); character details: Make Me a Hanzi (LGPL).
      </ThemedText>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fact}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.factLabel}>
        {label}
      </ThemedText>
      <View style={styles.factValue}>{children}</View>
    </View>
  );
}

function Practice({ info }: { info: CharacterInfo }) {
  const { session } = useAuth();
  const { showPinyin } = useDisplayPreferences();
  const [mode, setMode] = useState<WritingMode>('trace');
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const writing = useWritingCard(info.character);
  const inReview = writing.status.data;

  return (
    <Card title="Practise writing">
      <SegmentedControl
        label="Practice mode"
        options={MODES}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setResult(null);
          setAttempt((a) => a + 1);
        }}
      />
      {mode === 'memory' ? (
        <ThemedText themeColor="textSecondary" style={styles.centerText}>
          Write {showPinyin && info.pinyin.length ? `${info.pinyin[0]} · ` : ''}
          {info.definition ?? 'this character'} without looking.
        </ThemedText>
      ) : null}
      <WritingPad
        key={`${mode}-${attempt}`}
        character={mode === 'memory' ? 'the character' : info.character}
        data={info}
        mode={mode}
        onComplete={(r) =>
          setResult(r.misses === 0 && !r.hinted ? 'Perfect! No mistakes.' : `Finished with ${r.misses} ${r.misses === 1 ? 'miss' : 'misses'}${r.hinted ? ' and a hint' : ''}.`)
        }
      />
      {result ? (
        <ThemedText type="label" style={styles.centerText}>
          {result}
        </ThemedText>
      ) : null}
      {result ? (
        <Button
          label={mode === 'trace' ? 'Next: write it' : mode === 'write' ? 'Next: from memory' : 'Write it again'}
          onPress={() => {
            setMode(mode === 'trace' ? 'write' : 'memory');
            setResult(null);
            setAttempt((a) => a + 1);
          }}
        />
      ) : null}
      {session ? (
        <Button
          label={inReview ? 'Remove writing from review' : 'Add writing to review'}
          variant={inReview ? 'ghost' : 'secondary'}
          loading={writing.toggle.isPending || writing.status.isPending}
          onPress={() => writing.toggle.mutate(!inReview)}
        />
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          <ThemedText type="link" onPress={() => router.push('/sign-in')}>
            Log in
          </ThemedText>{' '}
          to add this character to your writing review.
        </ThemedText>
      )}
      {inReview ? (
        <ThemedText type="small" themeColor="success" role="status">
          ✓ Writing {info.character} is in your review.
        </ThemedText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: Spacing.six },
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1 },
  big: { fontSize: 72, lineHeight: 92, fontWeight: 500 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  factLabel: { width: 72 },
  factValue: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  centerText: { textAlign: 'center' },
});
