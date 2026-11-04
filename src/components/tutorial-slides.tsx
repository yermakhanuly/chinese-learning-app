import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Slide = { sf: SFSymbol; web: string; hanzi: string; title: string; body: string };

const SLIDES: Slide[] = [
  {
    sf: 'book.fill',
    web: 'school',
    hanzi: '学',
    title: 'Learn',
    body: 'Short 3–10 minute lessons follow the HSK levels: new words, grammar and exercises, one step at a time.',
  },
  {
    sf: 'rectangle.stack.fill',
    web: 'style',
    hanzi: '复习',
    title: 'Review',
    body: 'Words come back right before you would forget them. A few minutes of review a day keeps them for good.',
  },
  {
    sf: 'magnifyingglass',
    web: 'search',
    hanzi: '词典',
    title: 'Dictionary',
    body: 'Look up any word by characters, pinyin or English, hear it, and save it to study later.',
  },
  {
    sf: 'person.crop.circle.fill',
    web: 'person',
    hanzi: '我',
    title: 'Profile',
    body: 'Change your goal, daily target and Simplified/Traditional characters any time. Your progress syncs between iPhone and web.',
  },
];

/** Onboarding tutorial (#10): what each tab is for. */
export function TutorialSlides({
  onDone,
  doneLabel = 'Start learning',
  busy = false,
}: {
  onDone: () => void;
  doneLabel?: string;
  /** Shows a spinner on the final button while `onDone` saves. */
  busy?: boolean;
}) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;

  return (
    <View style={styles.root}>
      <View
        style={[styles.slide, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        aria-live="polite"
        aria-label={`Step ${index + 1} of ${SLIDES.length}: ${slide.title}`}>
        <View style={[styles.icon, { backgroundColor: theme.tint }]}>
          <SymbolView name={{ ios: slide.sf, web: slide.web as never }} size={30} tintColor={theme.onTint} />
        </View>
        <ThemedText type="hanzi" themeColor="tint">
          {slide.hanzi}
        </ThemedText>
        <ThemedText type="subtitle">{slide.title}</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.body}>
          {slide.body}
        </ThemedText>
      </View>
      <View style={styles.dots} aria-hidden>
        {SLIDES.map((s, i) => (
          <View key={s.title} style={[styles.dot, { backgroundColor: i === index ? theme.tint : theme.border }]} />
        ))}
      </View>
      <View style={styles.buttons}>
        {index > 0 ? (
          <Button label="Back" variant="secondary" onPress={() => setIndex(index - 1)} style={styles.flex} />
        ) : null}
        <Button
          label={last ? doneLabel : 'Next'}
          onPress={() => (last ? onDone() : setIndex(index + 1))}
          loading={last && busy}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.four },
  slide: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 300,
    justifyContent: 'center',
  },
  icon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  body: { textAlign: 'center', maxWidth: 420 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.two },
  dot: { width: 8, height: 8, borderRadius: 4 },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
});
