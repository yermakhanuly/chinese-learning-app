/**
 * The screens of a lesson: new word, grammar note and the three exercise kinds.
 * Exercises report the learner's current answer through `onChange`; the player grades it.
 */
import { createContext, use, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RubyText } from '@/components/ruby-text';
import { ThemedText } from '@/components/themed-text';
import { Hanzi, Pinyin, SpeakButton, pickScript, useScript } from '@/components/word-parts';
import { Radius, Spacing } from '@/constants/theme';
import type { WordDetail } from '@/hooks/use-course';
import { useTheme } from '@/hooks/use-theme';
import { seededShuffle, type Answer } from '@/lib/lesson-flow';
import type { Step } from '@/lib/lessons';
import type { Token } from '@/lib/sentences';
import { speakChinese } from '@/lib/speech';
import { useDisplayPreferences } from '@/providers/display-preferences';

type LessonData = { readings: Record<string, Token[]>; wordDetails: Record<string, WordDetail>; seed: string };

export const LessonDataContext = createContext<LessonData>({ readings: {}, wordDetails: {}, seed: '' });

const HAN = /[㐀-鿿]/;

/** Chinese with pinyin when we have readings for it; plain text otherwise. */
function Zh({ text, size = 22 }: { text: string; size?: number }) {
  const { readings } = use(LessonDataContext);
  const tokens = readings[text];
  if (tokens) return <RubyText tokens={tokens} size={size} />;
  return <ThemedText style={{ fontSize: size, lineHeight: size * 1.4 }}>{text}</ThemedText>;
}

/** An option label: Chinese with pinyin, or plain English. */
function OptionText({ text }: { text: string }) {
  return HAN.test(text) ? <Zh text={text} size={20} /> : <ThemedText>{text}</ThemedText>;
}

// ---------------------------------------------------------------------------
// Teaching steps

export function WordStep({ word }: { word: string }) {
  const theme = useTheme();
  const { wordDetails, readings } = use(LessonDataContext);
  const { showPinyin } = useDisplayPreferences();
  const script = useScript();
  const detail = wordDetails[word];

  // Say the new word once when it appears.
  useEffect(() => {
    speakChinese(word);
  }, [word]);

  if (!detail) return <Zh text={word} size={48} />;
  const example = detail.example;
  return (
    <View style={styles.gap}>
      <ThemedText type="smallBold" themeColor="tint">
        NEW WORD
      </ThemedText>
      <View style={styles.wordHero}>
        <View style={styles.flex}>
          <Hanzi simplified={word} traditional={detail.traditional} size={64} />
          {showPinyin ? <Pinyin text={detail.pinyin} size={24} /> : null}
        </View>
        <SpeakButton text={word} label={`Play ${pickScript(script, word, detail.traditional)}`} size={52} />
      </View>
      <ThemedText type="subtitle">{detail.meanings.slice(0, 2).join('; ')}</ThemedText>
      {detail.classifiers.length ? (
        <ThemedText themeColor="textSecondary">Measure word: {detail.classifiers.join(', ')}</ThemedText>
      ) : null}
      {example ? (
        <View style={[styles.example, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          <View style={styles.row}>
            <RubyText tokens={readings[example.simplified] ?? example.tokens} highlight={word} style={styles.flex} />
            <SpeakButton text={example.simplified} label="Play example" size={36} />
          </View>
          <ThemedText themeColor="textSecondary">{example.english}</ThemedText>
        </View>
      ) : null}
    </View>
  );
}

export function GrammarStep({ step }: { step: Extract<Step, { type: 'grammar' }> }) {
  const theme = useTheme();
  return (
    <View style={styles.gap}>
      <ThemedText type="smallBold" themeColor="tint">
        GRAMMAR
      </ThemedText>
      <ThemedText type="subtitle">{step.title}</ThemedText>
      <ThemedText>{step.body}</ThemedText>
      {step.examples.map((e) => (
        <View key={e.zh} style={[styles.example, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Zh text={e.zh} />
            </View>
            <SpeakButton text={e.zh} label="Play example" size={36} />
          </View>
          <ThemedText themeColor="textSecondary">{e.en}</ThemedText>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Exercises

type ExerciseProps<S> = {
  step: S;
  index: number;
  answer: Answer | null;
  onChange: (answer: Answer) => void;
  /** After Check: answers are locked and right/wrong is shown. */
  checked: boolean;
};

/** Options in a shuffled but stable order, keeping their original index for grading. */
function useShuffledOptions(options: string[], index: number) {
  const { seed } = use(LessonDataContext);
  return useMemo(
    () =>
      seededShuffle(
        options.map((text, i) => ({ text, i })),
        `${seed}-${index}`,
      ),
    [options, index, seed],
  );
}

function OptionList({
  options,
  index,
  correct,
  answer,
  onChange,
  checked,
  label,
}: {
  options: string[];
  index: number;
  correct: number;
  answer: Answer | null;
  onChange: (a: Answer) => void;
  checked: boolean;
  label: string;
}) {
  const theme = useTheme();
  const shuffled = useShuffledOptions(options, index);
  return (
    <View role="radiogroup" aria-label={label} style={styles.options}>
      {shuffled.map(({ text, i }) => {
        const selected = answer === i;
        const isRight = checked && i === correct;
        const isWrong = checked && selected && i !== correct;
        const border = isRight ? theme.success : isWrong ? theme.danger : selected ? theme.tint : theme.border;
        return (
          <Pressable
            key={i}
            role="radio"
            aria-checked={selected}
            aria-label={text}
            disabled={checked}
            onPress={() => onChange(i)}
            style={({ pressed }) => [
              styles.option,
              {
                borderColor: border,
                borderWidth: selected || isRight ? 2 : 1,
                backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
              },
              pressed && styles.pressed,
            ]}>
            <OptionText text={text} />
          </Pressable>
        );
      })}
    </View>
  );
}

export function ChoiceExercise({ step, index, answer, onChange, checked }: ExerciseProps<Extract<Step, { type: 'choice' }>>) {
  const theme = useTheme();
  useEffect(() => {
    if (step.listen) speakChinese(step.zh);
  }, [step]);
  return (
    <View style={styles.gap}>
      <ThemedText type="subtitle">{step.prompt}</ThemedText>
      {step.listen ? (
        <View style={styles.listen}>
          <SpeakButton text={step.zh} label="Play again" size={72} />
          <ThemedText themeColor="textSecondary">Tap to listen again</ThemedText>
          {/* After checking, show what was said. */}
          {checked ? <Zh text={step.zh} /> : null}
        </View>
      ) : step.zh ? (
        <View style={[styles.prompt, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={styles.flex}>
            <Zh text={step.zh} size={28} />
          </View>
          <SpeakButton text={step.zh} label="Play" size={40} />
        </View>
      ) : null}
      <OptionList
        options={step.options}
        index={index}
        correct={step.answer}
        answer={answer}
        onChange={onChange}
        checked={checked}
        label={step.prompt}
      />
    </View>
  );
}

export function FillExercise({ step, index, answer, onChange, checked }: ExerciseProps<Extract<Step, { type: 'fill' }>>) {
  const theme = useTheme();
  const chosen = typeof answer === 'number' ? step.options[answer] : null;
  return (
    <View style={styles.gap}>
      <ThemedText type="subtitle">Fill in the blank</ThemedText>
      <ThemedText themeColor="textSecondary">{step.en}</ThemedText>
      <View style={[styles.prompt, styles.fillLine, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {step.before ? <Zh text={step.before} size={26} /> : null}
        <View style={[styles.blank, { borderBottomColor: theme.tint }]}>
          {chosen ? <Zh text={chosen} size={26} /> : <ThemedText style={styles.blankText}> </ThemedText>}
        </View>
        {step.after ? <Zh text={step.after} size={26} /> : null}
      </View>
      <OptionList
        options={step.options}
        index={index}
        correct={step.answer}
        answer={answer}
        onChange={onChange}
        checked={checked}
        label="Choose the missing word"
      />
    </View>
  );
}

type Tile = { id: number; text: string };

export function BuildExercise({ step, index, onChange, checked }: ExerciseProps<Extract<Step, { type: 'build' }>>) {
  const theme = useTheme();
  const { seed } = use(LessonDataContext);
  const bank: Tile[] = useMemo(
    () =>
      seededShuffle(
        [...step.answer, ...step.distractors].map((text, id) => ({ id, text })),
        `${seed}-${index}`,
      ),
    [step, seed, index],
  );
  // Placed tiles by id (the same word can appear on two tiles).
  const [placed, setPlaced] = useState<number[]>([]);
  const place = (ids: number[]) => {
    setPlaced(ids);
    onChange(ids.map((id) => bank.find((t) => t.id === id)!.text));
  };

  const zhTiles = step.direction === 'en-zh';
  const tile = (t: Tile, where: 'line' | 'bank') => (
    <Pressable
      key={t.id}
      role="button"
      aria-label={where === 'bank' ? `Add ${t.text}` : `Remove ${t.text}`}
      disabled={checked}
      onPress={() => place(where === 'bank' ? [...placed, t.id] : placed.filter((id) => id !== t.id))}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: theme.background, borderColor: theme.border },
        pressed && styles.pressed,
      ]}>
      {zhTiles ? <Zh text={t.text} size={22} /> : <ThemedText type="label">{t.text}</ThemedText>}
    </Pressable>
  );

  return (
    <View style={styles.gap}>
      <ThemedText type="subtitle">{zhTiles ? 'Say this in Chinese' : 'Translate this sentence'}</ThemedText>
      <View style={[styles.prompt, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={styles.flex}>{zhTiles ? <ThemedText type="label">{step.source}</ThemedText> : <Zh text={step.source} size={26} />}</View>
        {zhTiles ? null : <SpeakButton text={step.source} label="Play" size={40} />}
      </View>
      <View
        aria-label="Your answer"
        style={[styles.line, { borderColor: checked ? theme.border : theme.tint, backgroundColor: theme.backgroundElement }]}>
        {placed.map((id) => tile(bank.find((t) => t.id === id)!, 'line'))}
      </View>
      <View style={styles.bank} aria-label="Word tiles">
        {bank.map((t) =>
          placed.includes(t.id) ? (
            <View key={t.id} style={[styles.tile, styles.tileUsed, { borderColor: theme.border }]}>
              <View style={styles.hidden}>{zhTiles ? <Zh text={t.text} size={22} /> : <ThemedText type="label">{t.text}</ThemedText>}</View>
            </View>
          ) : (
            tile(t, 'bank')
          ),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.three },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  wordHero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  example: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three, gap: Spacing.two },
  listen: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three },
  prompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.medium,
    padding: Spacing.three,
  },
  fillLine: { flexWrap: 'wrap', alignItems: 'flex-end', gap: Spacing.one },
  blank: { minWidth: 56, borderBottomWidth: 2, alignItems: 'center', paddingHorizontal: Spacing.one },
  blankText: { fontSize: 26, lineHeight: 36 },
  options: { gap: Spacing.two },
  option: { borderRadius: Radius.medium, padding: Spacing.three, minHeight: 56, justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  line: {
    minHeight: 72,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  bank: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center' },
  tile: {
    borderWidth: 1,
    borderBottomWidth: 3,
    borderRadius: Radius.small + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 48,
    justifyContent: 'center',
  },
  tileUsed: { backgroundColor: 'transparent', borderStyle: 'dashed' },
  hidden: { opacity: 0 },
});
