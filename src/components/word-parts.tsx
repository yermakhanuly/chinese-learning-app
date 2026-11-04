/**
 * Small building blocks for showing Chinese words: characters in the learner's script and size,
 * tone-colored pinyin, HSK level badges, audio buttons and frequency.
 */
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { toneOfMarkedSyllable } from '@/lib/pinyin';
import { useSpeech } from '@/lib/speech';
import { useDisplayPreferences } from '@/providers/display-preferences';

/** Simplified for guests; otherwise the learner's choice from onboarding/profile. */
export function useScript(): 'simplified' | 'traditional' {
  return useProfile().data?.script === 'traditional' ? 'traditional' : 'simplified';
}

export function pickScript(script: 'simplified' | 'traditional', simplified: string, traditional: string) {
  return script === 'traditional' && traditional ? traditional : simplified;
}

/** Chinese characters in the learner's script, scaled by their Hanzi size setting. */
export function Hanzi({
  simplified,
  traditional,
  size,
  style,
}: {
  simplified: string;
  traditional: string;
  /** Base font size before the learner's size setting. */
  size: number;
  style?: TextStyle;
}) {
  const theme = useTheme();
  const script = useScript();
  const { hanziScale } = useDisplayPreferences();
  const fontSize = Math.round(size * hanziScale);
  return (
    <Text
      lang="zh"
      style={[{ color: theme.text, fontSize, lineHeight: Math.round(fontSize * 1.3), fontWeight: 500 }, style]}>
      {pickScript(script, simplified, traditional)}
    </Text>
  );
}

const TONE_COLOR: Record<number, ThemeColor> = { 1: 'tone1', 2: 'tone2', 3: 'tone3', 4: 'tone4', 5: 'tone5' };

/** Tone-marked pinyin, each syllable in its tone color (if the learner keeps tone colors on). */
export function Pinyin({ text, size = 16, style }: { text: string; size?: number; style?: TextStyle }) {
  const theme = useTheme();
  const { toneColors } = useDisplayPreferences();
  const parts = text.split(/(\s+)/);
  return (
    <Text style={[{ fontSize: size, lineHeight: Math.round(size * 1.4), color: theme.textSecondary }, style]}>
      {toneColors
        ? parts.map((part, i) =>
            /\s/.test(part) || !part ? (
              part
            ) : (
              <Text key={i} style={{ color: theme[TONE_COLOR[toneOfMarkedSyllable(part)]] }}>
                {part}
              </Text>
            ),
          )
        : text}
    </Text>
  );
}

export function LevelBadge({ level }: { level: number | null }) {
  const theme = useTheme();
  const label = level == null ? 'Not HSK' : level === 7 ? 'HSK 7–9' : `HSK ${level}`;
  return (
    <View
      style={[
        styles.badge,
        level == null
          ? { borderColor: theme.border }
          : { borderColor: theme.tint, backgroundColor: theme.backgroundElement },
      ]}>
      <ThemedText type="smallBold" themeColor={level == null ? 'textSecondary' : 'tint'} style={styles.badgeText}>
        {label}
      </ThemedText>
    </View>
  );
}

/** Plays `text` with the device's Chinese voice; shows when it's the one playing. */
export function SpeakButton({ text, label, size = 40 }: { text: string; label: string; size?: number }) {
  const theme = useTheme();
  const { playingId, speak, stop } = useSpeech();
  const playing = playingId === text;
  return (
    <Pressable
      role="button"
      aria-label={playing ? 'Stop' : label}
      onPress={() => (playing ? stop() : speak(text))}
      hitSlop={8}
      style={({ pressed }) => [
        styles.round,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: playing ? theme.tint : theme.backgroundElement,
        },
        pressed && styles.pressed,
      ]}>
      <SymbolView
        name={{ ios: playing ? 'stop.fill' : 'speaker.wave.2.fill', web: playing ? 'stop_circle' : 'volume_up' }}
        size={size * 0.5}
        tintColor={playing ? theme.onTint : theme.tint}
      />
    </Pressable>
  );
}

/** Corpus frequency rank → 1–5 bars and a plain-language label. */
export function frequencyBand(rank: number | null): { bars: number; label: string } {
  if (rank == null) return { bars: 1, label: 'Rare' };
  if (rank <= 1000) return { bars: 5, label: 'Very common' };
  if (rank <= 3000) return { bars: 4, label: 'Common' };
  if (rank <= 8000) return { bars: 3, label: 'Fairly common' };
  if (rank <= 20000) return { bars: 2, label: 'Less common' };
  return { bars: 1, label: 'Rare' };
}

export function FrequencyMeter({ rank }: { rank: number | null }) {
  const theme = useTheme();
  const { bars, label } = frequencyBand(rank);
  return (
    <View style={styles.freq} role="img" aria-label={`Frequency: ${label}${rank ? `, rank ${rank}` : ''}`}>
      <View style={styles.bars}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View
            key={i}
            style={[
              styles.bar,
              { height: 6 + i * 3, backgroundColor: i <= bars ? theme.tint : theme.backgroundSelected },
            ]}
          />
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
        {rank ? ` · #${rank.toLocaleString('en-US')}` : ''}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 12, lineHeight: 16 },
  round: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  freq: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 21 },
  bar: { width: 5, borderRadius: 2 },
});
