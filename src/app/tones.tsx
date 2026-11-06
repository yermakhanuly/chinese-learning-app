import { Stack, router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { SpeakButton } from '@/components/word-parts';
import { TONE_CHANGES, TONE_PAIRS, TONE_SYLLABLES, TONES } from '@/constants/tones';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useWordsInfo } from '@/hooks/use-audio';
import { useTheme } from '@/hooks/use-theme';
import { syllableText } from '@/lib/audio-key';
import { speakChinese, useSpeech } from '@/lib/speech';

const TONE_COLOR: Record<number, ThemeColor> = { 1: 'tone1', 2: 'tone2', 3: 'tone3', 4: 'tone4' };

/** The classic 5-level pitch chart of a tone. */
function ToneChart({ contour, color }: { contour: number[]; color: string }) {
  const theme = useTheme();
  const w = 64;
  const h = 48;
  const x = (i: number) => 6 + (i * (w - 12)) / Math.max(1, contour.length - 1);
  const y = (level: number) => h - 4 - ((level - 1) * (h - 8)) / 4;
  return (
    <Svg width={w} height={h}>
      {[1, 2, 3, 4, 5].map((l) => (
        <Line key={l} x1={0} x2={w} y1={y(l)} y2={y(l)} stroke={theme.border} strokeWidth={1} />
      ))}
      <Polyline
        points={contour.map((c, i) => `${x(i)},${y(c)}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function SyllableButton({ syllable, tone, label, char }: { syllable: string; tone: number; label: string; char: string }) {
  const theme = useTheme();
  const { playingId } = useSpeech();
  const id = syllableText(syllable, tone);
  return (
    <Pressable
      role="button"
      aria-label={`Play ${label}`}
      onPress={() => speakChinese(id, id, char)}
      style={({ pressed }) => [
        styles.syllable,
        {
          borderColor: theme[TONE_COLOR[tone]],
          backgroundColor: playingId === id ? theme.backgroundSelected : pressed ? theme.backgroundSelected : theme.backgroundElement,
        },
      ]}>
      <ThemedText type="label" style={{ color: theme[TONE_COLOR[tone]] }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** Tone trainer: the four tones, every tone pair, and the tone changes. */
const PAIR_WORDS = TONE_PAIRS.flatMap((p) => p.words);

export default function TonesScreen() {
  const theme = useTheme();
  const info = useWordsInfo(PAIR_WORDS).data;
  return (
    <>
      <Stack.Screen options={{ title: 'Tone trainer' }} />
      <Screen stacked>
        <ThemedText themeColor="textSecondary">
          Mandarin has four tones plus a light neutral tone. The same syllable with a different tone is a different
          word: mā 妈 (mum), má 麻 (hemp), mǎ 马 (horse), mà 骂 (to scold).
        </ThemedText>

        {TONES.map((t) => (
          <Card key={t.tone}>
            <View style={styles.toneHead}>
              <ToneChart contour={t.contour} color={theme[TONE_COLOR[t.tone]]} />
              <View style={styles.flex}>
                <ThemedText type="heading">
                  {t.name} · {t.mark}
                </ThemedText>
                <ThemedText themeColor="textSecondary">{t.how}</ThemedText>
              </View>
            </View>
            <View style={styles.wrap}>
              {TONE_SYLLABLES.map((s) => (
                <SyllableButton key={s.syllable} syllable={s.syllable} tone={t.tone} label={s.marked[t.tone - 1]} char={s.chars[t.tone - 1]} />
              ))}
            </View>
          </Card>
        ))}

        <Card title="Neutral tone">
          <ThemedText themeColor="textSecondary">
            Short and light, with no mark: the second syllable of 妈妈 māma, 谢谢 xièxie, 朋友 péngyou, and particles like
            吗 ma, 呢 ne, 的 de.
          </ThemedText>
        </Card>

        <Button label="Test yourself: tone quiz" onPress={() => router.push({ pathname: '/tone-quiz', params: { mode: 'syllable' } })} />

        <ThemedText type="subtitle">Tone pairs</ThemedText>
        <ThemedText themeColor="textSecondary">
          Most words have two syllables, so practise tones in pairs. 0 = neutral tone.
        </ThemedText>
        <View role="list" style={styles.pairs}>
          {TONE_PAIRS.map((p) => (
            <View key={p.pair} role="listitem" style={[styles.pair, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold" themeColor="tint" style={styles.pairLabel}>
                {p.pair}
              </ThemedText>
              {p.words.map((w) => (
                <View key={w} style={styles.pairWord}>
                  <View>
                    <ThemedText lang="zh" style={styles.pairZh}>
                      {w}
                    </ThemedText>
                    {info?.get(w) ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {info.get(w)!.pinyin}
                      </ThemedText>
                    ) : null}
                  </View>
                  <SpeakButton text={w} label={`Play ${w}`} size={32} />
                </View>
              ))}
            </View>
          ))}
        </View>

        <ThemedText type="subtitle">Tone changes</ThemedText>
        {TONE_CHANGES.map((c) => (
          <Card key={c.title} title={c.title}>
            <ThemedText themeColor="textSecondary">{c.rule}</ThemedText>
            {c.examples.map((e) => (
              <View key={e.zh} style={styles.example}>
                <ThemedText lang="zh" style={styles.pairZh}>
                  {e.zh}
                </ThemedText>
                <View style={styles.flex}>
                  <ThemedText type="small" themeColor="textSecondary">
                    written {e.written}
                  </ThemedText>
                  <ThemedText type="smallBold">said {e.spoken}</ThemedText>
                </View>
                <SpeakButton text={e.zh} label={`Play ${e.zh}`} size={32} />
              </View>
            ))}
          </Card>
        ))}
        <Button
          label="Tone quiz with words"
          variant="secondary"
          onPress={() => router.push({ pathname: '/tone-quiz', params: { mode: 'word' } })}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toneHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  syllable: { borderWidth: 2, borderRadius: Radius.small, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, minWidth: 56, alignItems: 'center' },
  pairs: { gap: Spacing.two },
  pair: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.small, padding: Spacing.two, flexWrap: 'wrap' },
  pairLabel: { width: 32 },
  pairWord: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  pairZh: { fontSize: 22, lineHeight: 30 },
  example: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});
