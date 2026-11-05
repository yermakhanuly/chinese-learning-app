/**
 * Lesson content format and its automatic checker. Shared by the drafting script (Node), the
 * import script (Node) and the app. Relative `.ts` imports only.
 *
 * Content is authored in English + simplified Chinese; pinyin and traditional forms are added
 * at import time from the dictionary, so authors (and the AI drafting) never type them.
 */
import { isHan, segment, type Lexicon } from './sentences.ts';

export type Example = { zh: string; en: string };

export type Step =
  /** Introduces a new word (pinyin, meaning, audio, example come from the dictionary). */
  | { type: 'word'; word: string }
  /** A short grammar explanation with examples. */
  | { type: 'grammar'; title: string; body: string; examples: Example[] }
  /**
   * Pick one option. `zh` is shown (or only played, when `listen`) above the prompt.
   * Options are English meanings or Chinese words, depending on the question.
   */
  | { type: 'choice'; prompt: string; zh: string; listen: boolean; options: string[]; answer: number }
  /** Complete the Chinese sentence `before ___ after`; `en` is its translation. */
  | { type: 'fill'; en: string; before: string; after: string; options: string[]; answer: number }
  /**
   * Arrange tiles into the translation of `source`.
   * en-zh: source is English, tiles are Chinese words. zh-en: source is Chinese, tiles are English words.
   */
  | {
      type: 'build';
      direction: 'en-zh' | 'zh-en';
      source: string;
      answer: string[];
      /** Other correct tile orders (e.g. 今天我… and 我今天…). */
      also: string[][];
      distractors: string[];
    };

export type StepType = Step['type'];

export type Lesson = {
  id: string;
  title: string;
  /** 'lesson' teaches new words; 'quiz' (end of unit) only tests. */
  kind: 'lesson' | 'quiz';
  /** Words this lesson introduces (empty for quizzes). */
  words: string[];
  steps: Step[];
};

export type Unit = {
  id: string;
  title: string;
  title_zh: string;
  /** Topic slug (src/constants/topics.ts), used to match learners' goals. */
  theme: string;
  description: string;
  lessons: Lesson[];
};

export type Course = { level: number; units: Unit[] };

/** Chinese text fields of a step, for checking and for adding pinyin. */
export function chineseTexts(step: Step): string[] {
  switch (step.type) {
    case 'word':
      return [step.word];
    case 'grammar':
      return step.examples.map((e) => e.zh);
    case 'choice': {
      const zhOptions = step.options.filter((o) => [...o].some(isHan));
      return [step.zh, ...zhOptions].filter(Boolean);
    }
    case 'fill':
      return [step.before + step.options[step.answer] + step.after, ...step.options];
    case 'build':
      return step.direction === 'en-zh' ? [step.answer.join(''), ...step.distractors] : [step.source];
  }
}

/**
 * Words a Chinese text uses that the learner hasn't been taught. A dictionary word counts as
 * known when it was taught, or when every character in it is a taught one-character word
 * (不是 = 不 + 是). Punctuation, digits and Latin letters are ignored.
 */
export function unknownWords(text: string, known: Set<string>, lex: Lexicon): string[] {
  const out: string[] = [];
  for (const token of segment(text, lex)) {
    if (![...token].some(isHan)) continue;
    if (known.has(token)) continue;
    if ([...token].every((ch) => known.has(ch))) continue;
    // A word the segmenter grouped differently (他们的 → 他们 + 的): try splitting it.
    if (splitsIntoKnown(token, known)) continue;
    out.push(token);
  }
  return out;
}

function splitsIntoKnown(token: string, known: Set<string>): boolean {
  const chars = [...token];
  const ok: boolean[] = [true, ...chars.map(() => false)];
  for (let i = 0; i < chars.length; i++) {
    if (!ok[i]) continue;
    for (let j = i + 1; j <= chars.length; j++) {
      if (known.has(chars.slice(i, j).join(''))) ok[j] = true;
    }
  }
  return ok[chars.length];
}

/**
 * Problems in one lesson, as readable sentences (empty = OK).
 * `known`: words taught before this lesson. The lesson's own `words` count as known too.
 */
export function checkLesson(lesson: Lesson, known: Set<string>, lex: Lexicon): string[] {
  const problems: string[] = [];
  const vocab = new Set([...known, ...lesson.words]);
  const where = (i: number, s: Step) => `step ${i + 1} (${s.type})`;

  if (lesson.kind === 'lesson') {
    const introduced = lesson.steps.filter((s) => s.type === 'word').map((s) => (s as { word: string }).word);
    for (const w of lesson.words) if (!introduced.includes(w)) problems.push(`new word ${w} has no word step`);
    for (const w of introduced) if (!lesson.words.includes(w)) problems.push(`word step for ${w}, which isn't a new word`);
  } else if (lesson.steps.some((s) => s.type === 'word' || s.type === 'grammar')) {
    problems.push('a quiz should only contain exercises');
  }
  const exercises = lesson.steps.filter((s) => s.type !== 'word' && s.type !== 'grammar').length;
  if (exercises < 5) problems.push(`only ${exercises} exercises (need at least 5)`);

  lesson.steps.forEach((step, i) => {
    const at = where(i, step);
    for (const text of chineseTexts(step)) {
      const unknown = unknownWords(text, vocab, lex);
      if (unknown.length) problems.push(`${at}: "${text}" uses words not taught yet: ${unknown.join(', ')}`);
    }
    switch (step.type) {
      case 'choice':
      case 'fill': {
        if (step.options.length < 2 || step.options.length > 4) problems.push(`${at}: needs 2–4 options`);
        if (new Set(step.options).size !== step.options.length) problems.push(`${at}: duplicate options`);
        if (!Number.isInteger(step.answer) || step.answer < 0 || step.answer >= step.options.length) {
          problems.push(`${at}: answer index ${step.answer} is out of range`);
        }
        if (step.type === 'choice' && step.listen && !step.zh) problems.push(`${at}: listening question has no Chinese`);
        if (step.type === 'fill' && !(step.before + step.after).trim()) problems.push(`${at}: sentence is empty`);
        break;
      }
      case 'build': {
        if (step.answer.length < 2) problems.push(`${at}: answer needs at least 2 tiles`);
        const answerSet = new Set(step.answer);
        for (const d of step.distractors) if (answerSet.has(d)) problems.push(`${at}: distractor "${d}" is also in the answer`);
        if (step.answer.some((t) => !t.trim())) problems.push(`${at}: empty tile`);
        for (const alt of step.also) {
          if ([...alt].sort().join('|') !== [...step.answer].sort().join('|')) {
            problems.push(`${at}: alternative order uses different tiles than the answer`);
          }
        }
        break;
      }
      case 'grammar':
        if (!step.examples.length) problems.push(`${at}: grammar note without examples`);
        break;
    }
  });
  return problems;
}

/** Problems across the whole course: every target word taught exactly once, unique ids. */
export function checkCourse(course: Course, targetWords: string[], lex: Lexicon): string[] {
  const problems: string[] = [];
  const taughtAt = new Map<string, string>();
  const ids = new Set<string>();
  const known = new Set<string>();
  for (const unit of course.units) {
    if (ids.has(unit.id)) problems.push(`duplicate id ${unit.id}`);
    ids.add(unit.id);
    for (const lesson of unit.lessons) {
      if (ids.has(lesson.id)) problems.push(`duplicate id ${lesson.id}`);
      ids.add(lesson.id);
      for (const w of lesson.words) {
        if (taughtAt.has(w)) problems.push(`${w} is taught twice (${taughtAt.get(w)} and ${lesson.id})`);
        taughtAt.set(w, lesson.id);
      }
      for (const p of checkLesson(lesson, known, lex)) problems.push(`${lesson.id}: ${p}`);
      lesson.words.forEach((w) => known.add(w));
    }
  }
  const missing = targetWords.filter((w) => !taughtAt.has(w));
  if (missing.length) problems.push(`never taught: ${missing.join(' ')}`);
  return problems;
}

/**
 * Whether the learner's tiles form the answer or one of the accepted alternatives. Compares the
 * text, not tile identity, so two tiles with the same word are interchangeable.
 */
export function isCorrectBuild(step: Extract<Step, { type: 'build' }>, given: string[]): boolean {
  const sep = step.direction === 'en-zh' ? '' : ' ';
  const norm = (tiles: string[]) => tiles.join(sep).replace(/\s+/g, ' ').trim().toLowerCase();
  const target = norm(given);
  return [step.answer, ...step.also].some((a) => norm(a) === target);
}
