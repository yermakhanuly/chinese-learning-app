/**
 * Builds the database rows for content (lessons, grammar points, readings, role-play scenarios)
 * from what authors write, adding what they don't: pinyin + traditional for every Chinese text,
 * word details, lengths. Shared by the import scripts (content/ files) and the `admin` Edge
 * Function (publishing dashboard edits), so both produce the same rows.
 * Relative `.ts` imports only (Node and Deno import this file).
 */
import { grammarTexts, readingTexts, type GrammarPoint, type ReadingText } from './grammar.ts';
import { chineseTexts, type Lesson, type Step } from './lessons.ts';
import { hanCount, isHan, tokenize, type Lexicon, type Token } from './sentences.ts';
import { scenarioTexts, type Scenario } from './tutor.ts';

export function readingsFor(texts: string[], lex: Lexicon, t2s: Map<string, string>): Record<string, Token[]> {
  const out: Record<string, Token[]> = {};
  for (const text of new Set(texts)) {
    const tokens = tokenize(text, lex, t2s);
    if (tokens) out[text] = tokens;
  }
  return out;
}

/** Every Chinese string a learner sees in a step, including single tiles and options. */
export function lessonChinese(step: Step): string[] {
  const texts = chineseTexts(step);
  if (step.type === 'build' && step.direction === 'en-zh') texts.push(...step.answer, ...step.distractors);
  if (step.type === 'fill') texts.push(step.before, step.after);
  if (step.type === 'grammar') texts.push(...step.examples.map((e) => e.zh));
  return texts.filter((t) => /[㐀-鿿]/.test(t));
}

export function lessonTexts(lesson: Lesson): string[] {
  return lesson.steps.flatMap(lessonChinese);
}

export type WordInfoRow = { traditional: string; pinyin: string; meanings: string[]; classifiers: string[] };
export type ExampleRow = { simplified: string; traditional: string; english: string; tokens: Token[] };

export function lessonRow(
  lesson: Lesson,
  unitId: string,
  position: number,
  lex: Lexicon,
  t2s: Map<string, string>,
  words: Map<string, WordInfoRow>,
  examples: Map<string, ExampleRow>,
  grammarLinks: Map<string, string>,
) {
  return {
    id: lesson.id,
    unit_id: unitId,
    position,
    title: lesson.title,
    kind: lesson.kind,
    words: lesson.words,
    steps: lesson.steps.map((s) => {
      const grammarId = s.type === 'grammar' ? grammarLinks.get(`${lesson.id}|${s.title}`) ?? (s as { grammar_id?: string }).grammar_id : undefined;
      return grammarId ? { ...s, grammar_id: grammarId } : s;
    }),
    readings: readingsFor(lessonTexts(lesson), lex, t2s),
    word_details: Object.fromEntries(
      lesson.words.flatMap((w) => {
        const row = words.get(w);
        if (!row) return [];
        return [
          [
            w,
            {
              traditional: row.traditional,
              pinyin: row.pinyin,
              meanings: row.meanings.slice(0, 4),
              classifiers: row.classifiers,
              example: examples.get(w) ?? null,
            },
          ],
        ];
      }),
    ),
    minutes: Math.max(2, Math.round(lesson.steps.length * 0.35)),
  };
}

export function grammarRow(point: GrammarPoint, position: number, ids: Set<string>, lessons: string[], lex: Lexicon, t2s: Map<string, string>) {
  return {
    id: point.id,
    hsk_level: point.level,
    position,
    title: point.title,
    topic: point.topic,
    summary: point.summary,
    structure: point.structure,
    explanation: point.explanation,
    examples: point.examples,
    mistakes: point.mistakes,
    related: point.related.filter((r) => ids.has(r)),
    exercises: point.exercises,
    words: point.words ?? [],
    readings: readingsFor(grammarTexts(point), lex, t2s),
    lessons,
  };
}

/** `meanings`: a short English gloss for words learners can tap (HSK meanings, else CC-CEDICT). */
export function readingRow(
  text: ReadingText,
  position: number,
  grammar: string[],
  lex: Lexicon,
  t2s: Map<string, string>,
  meanings: Map<string, string[]>,
) {
  const readings = readingsFor(readingTexts(text), lex, t2s);
  const glossed = new Map(text.new_words.map((w) => [w.word, w.en]));
  const wordDetails: Record<string, { pinyin: string; meanings: string[]; level: number | null }> = {};
  for (const s of text.sentences) {
    for (const t of readings[s.zh] ?? []) {
      if (!t.p || wordDetails[t.s]) continue;
      const name = text.names.includes(t.s) || text.speakers.some((sp) => sp.name === t.s);
      wordDetails[t.s] = {
        pinyin: t.p,
        meanings: glossed.has(t.s) ? [glossed.get(t.s)!] : name ? ['(a name)'] : (meanings.get(t.s) ?? []),
        level: lex.entries.get(t.s)?.level ?? null,
      };
    }
  }
  return {
    id: text.id,
    hsk_level: text.level,
    position,
    kind: text.kind,
    title: text.title,
    title_zh: text.title_zh,
    summary: text.summary,
    speakers: text.speakers,
    sentences: text.sentences,
    questions: text.questions,
    new_words: text.new_words,
    names: text.names,
    grammar,
    readings,
    word_details: wordDetails,
    char_count: text.sentences.reduce((n, s) => n + hanCount(s.zh), 0),
  };
}

export function scenarioRow(s: Scenario, position: number, lex: Lexicon, t2s: Map<string, string>) {
  return {
    id: s.id,
    hsk_level: s.level,
    position,
    title: s.title,
    emoji: s.emoji,
    setting: s.setting,
    ai_role: s.ai_role,
    learner_role: s.learner_role,
    voice: s.voice,
    goals: s.goals,
    opening: s.opening,
    phrases: s.phrases,
    names: s.names,
    words: s.words,
    readings: readingsFor([...scenarioTexts(s), ...s.words], lex, t2s),
  };
}

/**
 * Every run of Chinese characters' substrings up to `max` long: the only dictionary entries the
 * word splitter can ever use for these texts. Lets the Edge Function build a small lexicon from the
 * database instead of loading the whole dictionary (the splitting comes out the same).
 */
export function candidateWords(texts: string[], max = 8): string[] {
  const out = new Set<string>();
  for (const text of texts) {
    const chars = [...text];
    for (let i = 0; i < chars.length; i++) {
      if (!isHan(chars[i])) continue;
      let word = '';
      for (let j = i; j < Math.min(chars.length, i + max) && isHan(chars[j]); j++) {
        word += chars[j];
        out.add(word);
      }
    }
  }
  return [...out];
}

// --- Editing: database rows back to what authors write ---------------------------------------------

export type EditKind = 'unit' | 'lesson' | 'word' | 'grammar' | 'reading' | 'scenario';

/** What a draft holds for each kind: the authored format plus where the item sits. */
export type UnitDraft = { id: string; hsk_level: number; position: number; title: string; title_zh: string; theme: string; description: string };
export type LessonDraft = Lesson & { unit_id: string; position: number };
export type WordDraft = { simplified: string; meanings: string[]; classifiers: string[] };
export type GrammarDraft = GrammarPoint & { position: number; lessons: string[] };
export type ReadingDraft = ReadingText & { position: number; grammar: string[] };
export type ScenarioDraft = Scenario & { position: number };

type Row = Record<string, unknown>;

export function draftFromRow(kind: EditKind, r: Row): unknown {
  switch (kind) {
    case 'unit':
      return { id: r.id, hsk_level: r.hsk_level, position: r.position, title: r.title, title_zh: r.title_zh, theme: r.theme, description: r.description };
    case 'lesson':
      return { id: r.id, unit_id: r.unit_id, position: r.position, title: r.title, kind: r.kind, words: r.words, steps: r.steps };
    case 'word':
      return { simplified: r.simplified, meanings: r.meanings, classifiers: r.classifiers };
    case 'grammar':
      return {
        id: r.id, level: r.hsk_level, position: r.position, title: r.title, topic: r.topic, summary: r.summary, structure: r.structure,
        explanation: r.explanation, examples: r.examples, mistakes: r.mistakes, related: r.related, exercises: r.exercises,
        words: r.words ?? [], lessons: r.lessons ?? [],
      };
    case 'reading':
      return {
        id: r.id, level: r.hsk_level, position: r.position, kind: r.kind, title: r.title, title_zh: r.title_zh, summary: r.summary,
        speakers: r.speakers, names: r.names ?? [], new_words: r.new_words, sentences: r.sentences, questions: r.questions, grammar: r.grammar ?? [],
      };
    case 'scenario':
      return {
        id: r.id, level: r.hsk_level, position: r.position, title: r.title, emoji: r.emoji, setting: r.setting, ai_role: r.ai_role,
        learner_role: r.learner_role, voice: r.voice, goals: r.goals, opening: r.opening, phrases: r.phrases, names: r.names ?? [], words: r.words ?? [],
      };
  }
}

/** Chinese texts in a draft (for building its small lexicon and its audio). */
export function draftTexts(kind: EditKind, d: unknown): string[] {
  switch (kind) {
    case 'lesson':
      return [...lessonTexts(d as Lesson), ...(d as Lesson).words];
    case 'grammar':
      return [...grammarTexts(d as GrammarPoint), ...((d as GrammarPoint).words ?? [])];
    case 'reading':
      return [...readingTexts(d as ReadingText), ...(d as ReadingText).names, ...(d as ReadingText).new_words.map((w) => w.word)];
    case 'scenario':
      return [...scenarioTexts(d as Scenario), ...(d as Scenario).words, ...(d as Scenario).names];
    case 'word':
      return [(d as WordDraft).simplified];
    case 'unit':
      return [(d as UnitDraft).title_zh];
  }
}

/** The texts a published row has pinyin for (each should get some). */
export function pinyinTexts(kind: EditKind, d: unknown): string[] {
  switch (kind) {
    case 'lesson':
      return lessonTexts(d as Lesson);
    case 'grammar':
      return grammarTexts(d as GrammarPoint);
    case 'reading':
      return readingTexts(d as ReadingText);
    case 'scenario':
      return [...scenarioTexts(d as Scenario), ...(d as Scenario).words];
    default:
      return [];
  }
}

/** Fields that changed between two drafts (top level), for the review screen. */
export function changedFields(before: unknown, after: unknown): string[] {
  const a = (before ?? {}) as Row;
  const b = (after ?? {}) as Row;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

/** A starting point for a new item of each kind (the editor fills in the rest). */
export function newDraft(kind: EditKind, id: string): unknown {
  const level = Number(id.match(/^(?:hsk|g|r)?(\d)/)?.[1] ?? 1);
  switch (kind) {
    case 'unit':
      return { id, hsk_level: level, position: 99, title: '', title_zh: '', theme: 'daily-life', description: '' };
    case 'lesson':
      return { id, unit_id: id.replace(/-(l\d+|quiz)$/, ''), position: 99, title: '', kind: id.endsWith('-quiz') ? 'quiz' : 'lesson', words: [], steps: [] };
    case 'grammar':
      return {
        id, level, position: 999, title: '', topic: 'basics', summary: '', structure: [], explanation: '',
        examples: [], mistakes: [], related: [], exercises: [], words: [], lessons: [],
      };
    case 'reading':
      return {
        id, level, position: 999, kind: 'story', title: '', title_zh: '', summary: '', speakers: [], names: [],
        new_words: [], sentences: [], questions: [], grammar: [],
      };
    case 'scenario':
      return {
        id, level, position: 999, title: '', emoji: '💬', setting: '', ai_role: '', learner_role: '', voice: 'female',
        goals: ['', '', ''], opening: { zh: '', en: '' }, phrases: [], names: [], words: [],
      };
    case 'word':
      return { simplified: id, meanings: [], classifiers: [] };
  }
}

/** What a new id must look like, per kind (words can't be added: they come from the HSK lists). */
export const ID_PATTERNS: Record<Exclude<EditKind, 'word'>, { pattern: RegExp; example: string }> = {
  unit: { pattern: /^hsk\d-u\d{2}$/, example: 'hsk1-u11' },
  lesson: { pattern: /^hsk\d-u\d{2}-(l\d+|quiz)$/, example: 'hsk1-u01-l6' },
  grammar: { pattern: /^g[12]-[a-z0-9-]+$/, example: 'g1-zai-place' },
  reading: { pattern: /^r[12]-\d{2}$/, example: 'r1-11' },
  scenario: { pattern: /^[a-z]+(-[a-z]+)*$/, example: 'bank' },
};
