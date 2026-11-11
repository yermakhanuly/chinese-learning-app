/**
 * Grammar library and graded reading: content formats and their automatic checkers. Shared by the
 * drafting script (Node), the import script (Node) and the app. Relative `.ts` imports only.
 *
 * Content is authored in English + simplified Chinese (content/grammar/, content/reading/); pinyin
 * and traditional characters are added at import time, so authors never type them.
 */
import { GRAMMAR_TOPIC_SLUGS } from '../constants/grammar-topics.ts';
import type { Example, Step } from './lessons.ts';
import { unknownWords } from './lessons.ts';
import { hanCount, isHan, type Lexicon } from './sentences.ts';

// ---------------------------------------------------------------------------
// Grammar points

/**
 * Exercises. Every option carries `why`: shown when the learner picks it (for the right option, why
 * it's right). `order` has one explanation of the rule instead.
 */
export type GrammarExercise =
  /** Complete `before ___ after`; `en` translates the full sentence. */
  | { type: 'fill'; en: string; before: string; after: string; options: string[]; answer: number; why: string[] }
  /** Pick the one correct sentence. */
  | { type: 'pick'; prompt: string; options: string[]; answer: number; why: string[] }
  /** Change `source` as `instruction` says (e.g. "Make it negative with 没") — pick the result. */
  | { type: 'transform'; instruction: string; source: string; options: string[]; answer: number; why: string[] }
  /** Put the word tiles in order to say `en`. */
  | { type: 'order'; en: string; answer: string[]; also: string[][]; why: string };

export type GrammarExerciseType = GrammarExercise['type'];

export type CommonMistake = { wrong: string; right: string; why: string };

export type GrammarPoint = {
  /** g1-shi, g2-guo … (level + short slug) */
  id: string;
  level: 1 | 2;
  title: string;
  topic: string;
  /** One line: what it's for. */
  summary: string;
  /** Sentence patterns, e.g. "Subject + 是 + Noun". */
  structure: string[];
  /** Plain-English explanation; paragraphs separated by a blank line. */
  explanation: string;
  examples: Example[];
  mistakes: CommonMistake[];
  /** Ids of related points. */
  related: string[];
  exercises: GrammarExercise[];
  /** Words above the level that this point itself teaches (又, 才, 一样…), at most 4. */
  words?: string[];
};

/**
 * Words every text may use although the HSK lists don't have them on their own: 没 (the lists
 * have 没有 and 没关系; 没 + verb is HSK 1 grammar).
 */
export const BASE_WORDS = ['没'];

/** Outline entry (content/grammar/outline.json): what each point covers, in teaching order. */
export type GrammarOutlineEntry = {
  id: string;
  level: 1 | 2;
  title: string;
  topic: string;
  summary: string;
  /** Lesson grammar notes this point expands on: "<lesson id>|<note title>". */
  lesson_notes: string[];
};

/** A grammar exercise as a lesson step, so the lesson exercise screens can show and grade it. */
export function exerciseToStep(ex: GrammarExercise): Step {
  switch (ex.type) {
    case 'fill':
      return { type: 'fill', en: ex.en, before: ex.before, after: ex.after, options: ex.options, answer: ex.answer };
    case 'pick':
      return { type: 'choice', prompt: ex.prompt, zh: '', listen: false, options: ex.options, answer: ex.answer };
    case 'transform':
      return { type: 'choice', prompt: ex.instruction, zh: ex.source, listen: false, options: ex.options, answer: ex.answer };
    case 'order':
      return { type: 'build', direction: 'en-zh', source: ex.en, answer: ex.answer, also: ex.also, distractors: [] };
  }
}

/** Why the learner's answer is right or wrong (`picked` = option index; ignored for `order`). */
export function explanation(ex: GrammarExercise, picked: number | null): string {
  if (ex.type === 'order') return ex.why;
  return ex.why[picked ?? ex.answer] ?? ex.why[ex.answer];
}

/** Every Chinese text in a grammar point (for checking, pinyin and audio). */
export function grammarTexts(point: GrammarPoint): string[] {
  const texts = [
    ...point.examples.map((e) => e.zh),
    ...point.mistakes.flatMap((m) => [m.wrong, m.right]),
    ...point.exercises.flatMap(exerciseTexts),
  ];
  return [...new Set(texts.filter((t) => [...t].some(isHan)))];
}

function exerciseTexts(ex: GrammarExercise): string[] {
  switch (ex.type) {
    case 'fill':
      return [ex.before + ex.options[ex.answer] + ex.after, ex.before, ex.after, ...ex.options];
    case 'pick':
      return ex.options;
    case 'transform':
      return [ex.source, ...ex.options];
    case 'order':
      return [ex.answer.join(''), ...ex.answer];
  }
}

/**
 * Texts whose vocabulary is checked. `right`: correct Chinese, every word must be on the level.
 * `wrong`: deliberately wrong options and mistakes, which may break words apart (休休息息), so only
 * their characters must come from words on the level.
 */
function checkedTexts(point: GrammarPoint): { right: string[]; wrong: string[] } {
  const right = [...point.examples.map((e) => e.zh), ...point.mistakes.map((m) => m.right)];
  const wrong = point.mistakes.map((m) => m.wrong);
  for (const ex of point.exercises) {
    if (ex.type === 'order') {
      right.push(ex.answer.join(''));
      continue;
    }
    const others = ex.options.filter((_, i) => i !== ex.answer);
    if (ex.type === 'fill') {
      right.push(ex.before + ex.options[ex.answer] + ex.after);
      wrong.push(...others.map((o) => ex.before + o + ex.after));
    } else {
      if (ex.type === 'transform') right.push(ex.source);
      right.push(ex.options[ex.answer]);
      wrong.push(...others);
    }
  }
  return { right, wrong };
}

/**
 * Problems in one grammar point (empty = OK). `known`: the words its level may use (HSK words up to
 * its level). `ids`: every point id, for `related`.
 */
/**
 * `knownChars`: characters used in words up to the level (wrong-form options are checked per
 * character); worked out from `known` when not given.
 */
export function checkGrammarPoint(point: GrammarPoint, known: Set<string>, lex: Lexicon, ids: Set<string>, knownChars?: Set<string>): string[] {
  const problems: string[] = [];
  const taught = point.words ?? [];
  if (taught.length > 4) problems.push(`teaches ${taught.length} extra words (at most 4)`);
  for (const w of taught) if (!lex.entries.has(w)) problems.push(`extra word ${w} isn't in the dictionary`);
  const allowed = new Set([...known, ...BASE_WORDS, ...taught]);
  if (!/^g[12]-[a-z0-9-]+$/.test(point.id)) problems.push(`id ${point.id} should look like g1-shi`);
  if (point.level !== 1 && point.level !== 2) problems.push('level must be 1 or 2');
  if (!GRAMMAR_TOPIC_SLUGS.includes(point.topic)) problems.push(`unknown topic ${point.topic}`);
  if (!point.title.trim() || !point.summary.trim() || !point.explanation.trim()) problems.push('title, summary and explanation are required');
  if (!point.structure.length) problems.push('needs at least one structure');
  if (point.examples.length < 3 || point.examples.length > 6) problems.push(`has ${point.examples.length} examples (need 3–6)`);
  if (point.mistakes.length < 1 || point.mistakes.length > 3) problems.push(`has ${point.mistakes.length} common mistakes (need 1–3)`);
  for (const m of point.mistakes) {
    if (m.wrong === m.right) problems.push(`mistake "${m.wrong}": wrong and right are the same`);
    if (!m.why.trim()) problems.push(`mistake "${m.wrong}" has no explanation`);
  }
  for (const r of point.related) {
    if (r === point.id) problems.push('related lists itself');
    else if (!ids.has(r)) problems.push(`related point ${r} doesn't exist`);
  }

  const n = point.exercises.length;
  if (n < 6 || n > 10) problems.push(`has ${n} exercises (need 6–10)`);
  const types = new Set(point.exercises.map((e) => e.type));
  if (types.size < 3) problems.push(`exercises use ${types.size} kinds (need at least 3 of fill, pick, transform, order)`);

  point.exercises.forEach((ex, i) => {
    const at = `exercise ${i + 1} (${ex.type})`;
    if (ex.type === 'order') {
      if (ex.answer.length < 3) problems.push(`${at}: needs at least 3 tiles`);
      if (ex.answer.some((t) => !t.trim())) problems.push(`${at}: empty tile`);
      for (const alt of ex.also) {
        if ([...alt].sort().join('|') !== [...ex.answer].sort().join('|')) problems.push(`${at}: alternative order uses different tiles`);
      }
      if (!ex.why.trim()) problems.push(`${at}: no explanation`);
      return;
    }
    if (ex.options.length < 2 || ex.options.length > 4) problems.push(`${at}: needs 2–4 options`);
    if (new Set(ex.options).size !== ex.options.length) problems.push(`${at}: duplicate options`);
    if (!Number.isInteger(ex.answer) || ex.answer < 0 || ex.answer >= ex.options.length) problems.push(`${at}: answer index out of range`);
    if (ex.why.length !== ex.options.length) problems.push(`${at}: needs one "why" per option (${ex.why.length} for ${ex.options.length})`);
    if (ex.why.some((w) => !w.trim())) problems.push(`${at}: an explanation is empty`);
    if (ex.type === 'fill' && !(ex.before + ex.after).trim()) problems.push(`${at}: sentence is empty`);
    if (ex.type === 'transform' && ex.options.includes(ex.source)) problems.push(`${at}: an option is the unchanged sentence`);
  });

  const { right, wrong } = checkedTexts(point);
  for (const text of [...right, ...wrong]) if (/[A-Za-z]/.test(text)) problems.push(`"${text}" has Latin letters (no pinyin can be added)`);
  for (const text of right) {
    const unknown = unknownWords(text, allowed, lex);
    if (unknown.length) problems.push(`"${text}" uses words above HSK ${point.level}: ${unknown.join(', ')}`);
  }
  const chars = new Set([...allowed].flatMap((w) => [...w]));
  for (const c of knownChars ?? []) chars.add(c);
  for (const text of wrong) {
    const unknown = [...new Set([...text].filter((c) => isHan(c) && !chars.has(c)))];
    if (unknown.length) problems.push(`"${text}" uses characters above HSK ${point.level}: ${unknown.join(', ')}`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Graded reading

export type ReadingSpeaker = { name: string; voice: 'female' | 'male' };

export type ReadingSentence = {
  zh: string;
  en: string;
  /** Dialogues: index into `speakers`. */
  speaker?: number;
};

export type ReadingQuestion = { prompt: string; options: string[]; answer: number; why: string[] };

export type ReadingText = {
  /** r1-01 … r2-10 */
  id: string;
  level: 1 | 2;
  kind: 'story' | 'dialogue';
  title: string;
  title_zh: string;
  summary: string;
  /** Dialogues: two speakers (Chinese names or roles). */
  speakers: ReadingSpeaker[];
  /** People's names used in the text (allowed although not HSK words). */
  names: string[];
  /** Up to 3 words above the level, glossed for the learner. */
  new_words: { word: string; en: string }[];
  sentences: ReadingSentence[];
  questions: ReadingQuestion[];
};

/** Character count limits per level, so texts stay short enough to read in a few minutes. */
export const READING_LENGTH: Record<1 | 2, [number, number]> = { 1: [50, 220], 2: [100, 380] };

export function readingTexts(text: ReadingText): string[] {
  const texts = [
    text.title_zh,
    ...text.speakers.map((s) => s.name),
    ...text.sentences.map((s) => s.zh),
    ...text.questions.flatMap((q) => q.options),
    ...text.new_words.map((w) => w.word),
  ];
  return [...new Set(texts.filter((t) => [...t].some(isHan)))];
}

/** Problems in one reading text (empty = OK). `known`: HSK words up to its level. */
export function checkReading(text: ReadingText, known: Set<string>, lex: Lexicon): string[] {
  const problems: string[] = [];
  if (!/^r[12]-\d{2}$/.test(text.id)) problems.push(`id ${text.id} should look like r1-01`);
  if (text.level !== 1 && text.level !== 2) problems.push('level must be 1 or 2');
  if (!text.title.trim() || !text.title_zh.trim() || !text.summary.trim()) problems.push('title, title_zh and summary are required');
  if (text.new_words.length > 3) problems.push(`${text.new_words.length} new words (at most 3)`);
  if (text.sentences.length < 5 || text.sentences.length > 24) problems.push(`${text.sentences.length} sentences (need 5–24)`);

  if (text.kind === 'dialogue') {
    if (text.speakers.length !== 2) problems.push('a dialogue needs exactly 2 speakers');
    if (new Set(text.speakers.map((s) => s.voice)).size !== text.speakers.length) problems.push('the speakers need different voices');
    text.sentences.forEach((s, i) => {
      if (s.speaker === undefined || s.speaker < 0 || s.speaker >= text.speakers.length) problems.push(`line ${i + 1}: no valid speaker`);
    });
  } else {
    if (text.speakers.length) problems.push('a story has no speakers');
    if (text.sentences.some((s) => s.speaker !== undefined)) problems.push('story sentences have no speaker');
  }

  const chars = text.sentences.reduce((n, s) => n + hanCount(s.zh), 0);
  const [min, max] = READING_LENGTH[text.level] ?? [0, Infinity];
  if (chars < min || chars > max) problems.push(`${chars} characters (HSK ${text.level} texts need ${min}–${max})`);

  if (text.questions.length < 3 || text.questions.length > 5) problems.push(`${text.questions.length} questions (need 3–5)`);
  text.questions.forEach((q, i) => {
    const at = `question ${i + 1}`;
    if (q.options.length < 3 || q.options.length > 4) problems.push(`${at}: needs 3–4 options`);
    if (new Set(q.options).size !== q.options.length) problems.push(`${at}: duplicate options`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) problems.push(`${at}: answer out of range`);
    if (q.why.length !== q.options.length || q.why.some((w) => !w.trim())) problems.push(`${at}: needs one "why" per option`);
  });

  // Names aren't dictionary words, so the splitter may cut them into single characters: allow those too.
  const names = [...text.names, ...text.speakers.map((s) => s.name)];
  const allowed = new Set([...known, ...BASE_WORDS, ...names, ...names.flatMap((n) => [...n]), ...text.new_words.map((w) => w.word)]);
  for (const zh of [text.title_zh, ...text.sentences.map((s) => s.zh), ...text.questions.flatMap((q) => q.options)]) {
    const unknown = unknownWords(zh, allowed, lex);
    if (unknown.length) problems.push(`"${zh}" uses words above HSK ${text.level}: ${unknown.join(', ')}`);
  }
  return problems;
}

/** Share of questions right, 0–100. */
export function readingScore(questions: ReadingQuestion[], answers: (number | null)[]): number {
  if (!questions.length) return 100;
  const right = questions.filter((q, i) => answers[i] === q.answer).length;
  return Math.round((right / questions.length) * 100);
}
