/**
 * Drafts the HSK 1–2 grammar library and the graded readings with Claude, checked by
 * src/lib/grammar.ts.
 *
 *   npm run content:grammar          # needs ANTHROPIC_API_KEY (env, or scripts/.env)
 *
 * 1. Grammar outline (content/grammar/outline.json): ~70 points in teaching order; every grammar
 *    note of the HSK 1 lessons is mapped to one point.
 * 2. Each point (content/grammar/<id>.json): explanation, patterns, examples, common mistakes,
 *    exercises with an explanation for every option. Words: HSK words up to the point's level.
 * 3. Reading outline (content/reading/outline.json): 10 texts per level, stories and dialogues.
 * 4. Each text (content/reading/<id>.json) with comprehension questions.
 * Drafts that fail the checker go back to Claude with the problems listed (up to 3 tries).
 *
 * Existing files are kept, so re-running only drafts what's missing; delete a file to redo it.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Anthropic from '@anthropic-ai/sdk';

import { GRAMMAR_TOPICS } from '../src/constants/grammar-topics.ts';
import {
  checkGrammarPoint,
  checkReading,
  READING_LENGTH,
  type GrammarOutlineEntry,
  type GrammarPoint,
  type ReadingText,
} from '../src/lib/grammar.ts';
import type { Lesson } from '../src/lib/lessons.ts';
import { buildLexicon } from '../src/lib/sentences.ts';
import { parseCedictLine, parseHskEntry, type HskSourceEntry, type WordRow } from '../src/lib/vocab-parsers.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRAMMAR_DIR = join(ROOT, 'content', 'grammar');
const READING_DIR = join(ROOT, 'content', 'reading');
const MODEL = 'claude-opus-5-5';
const CONCURRENCY = 6;
const MAX_TRIES = 3;

const client = new Anthropic();
const spent = { input: 0, output: 0 };

// ---------------------------------------------------------------------------
// Data

function loadData() {
  const raw: HskSourceEntry[] = JSON.parse(readFileSync(join(ROOT, 'data', 'raw', 'complete-hsk.json'), 'utf8'));
  const words = [...new Map(raw.map(parseHskEntry).map((w) => [w.simplified, w])).values()];
  const cedict = readFileSync(join(ROOT, 'data', 'raw', 'cedict.txt'), 'utf8')
    .split('\n')
    .map(parseCedictLine)
    .filter((e) => e !== null);
  const lex = buildLexicon(
    words.map((w) => ({ simplified: w.simplified, traditional: w.traditional, pinyin: w.pinyin, level: w.hsk_level })),
    cedict,
  );
  const upTo = (level: number) => words.filter((w) => w.hsk_level !== null && w.hsk_level <= level);
  const known = { 1: new Set(upTo(1).map((w) => w.simplified)), 2: new Set(upTo(2).map((w) => w.simplified)) };
  return { lex, words, upTo, known };
}

const describe = (w: WordRow) => `${w.simplified} (${w.pinyin}): ${w.meanings.slice(0, 2).join('; ')}`;

/** Grammar notes in the HSK 1 lessons, as "<lesson id>|<title>". */
function lessonNotes(): string[] {
  const dir = join(ROOT, 'content', 'hsk1');
  return readdirSync(dir)
    .filter((f) => /^hsk1-u\d{2}-l\d+\.json$/.test(f))
    .sort()
    .flatMap((f) => {
      const lesson: Lesson = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      return lesson.steps.flatMap((s) => (s.type === 'grammar' ? [`${lesson.id}|${s.title}`] : []));
    });
}

// ---------------------------------------------------------------------------
// Claude calls with structured output

async function ask<T>(system: string, prompt: string, schema: Record<string, unknown>, effort: 'low' | 'medium' | 'high'): Promise<T> {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    output_config: { effort, format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: prompt }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason !== 'end_turn') throw new Error(`stopped with ${message.stop_reason}`);
  const text = message.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('no text in response');
  spent.input += message.usage.input_tokens;
  spent.output += message.usage.output_tokens;
  return JSON.parse(text.text) as T;
}

/** Asks, checks, and sends the problems back until the draft passes (or MAX_TRIES). */
async function draftChecked<T>(
  label: string,
  prompt: string,
  schema: Record<string, unknown>,
  effort: 'low' | 'medium' | 'high',
  check: (draft: T) => string[],
): Promise<T> {
  let feedback = '';
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const draft = await ask<T>(AUTHOR, prompt + feedback, schema, effort);
    const problems = check(draft);
    if (!problems.length) return draft;
    console.log(`  ${label}: attempt ${attempt} has ${problems.length} problems`);
    feedback = `\n\nYour previous draft had these problems. Return a corrected full draft:\n- ${problems.join('\n- ')}\n\nPrevious draft:\n${JSON.stringify(draft)}`;
  }
  throw new Error(`${label} still has problems after ${MAX_TRIES} tries`);
}

const AUTHOR = `You write grammar lessons and graded readers for a Mandarin course app for adult beginners whose explanations are in English. The course follows the official 2026 HSK 3.0 syllabus. You are careful: learners trust that every sentence is natural, correct Mandarin (except sentences explicitly marked as wrong) and uses only words of their level. Explanations are short, friendly and free of linguistic jargon; when a term is unavoidable, explain it in passing.`;

const str = { type: 'string' };
const strs = { type: 'array', items: str };
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

// ---------------------------------------------------------------------------
// 1. Grammar outline

const GRAMMAR_OUTLINE_SCHEMA = obj({
  points: {
    type: 'array',
    items: obj({
      id: str,
      level: { type: 'integer', enum: [1, 2] },
      title: str,
      topic: { type: 'string', enum: GRAMMAR_TOPICS.map((t) => t.slug) },
      summary: str,
      lesson_notes: strs,
    }),
  },
});

function checkGrammarOutline(points: GrammarOutlineEntry[], notes: string[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const p of points) {
    if (!/^g[12]-[a-z0-9-]+$/.test(p.id) || !p.id.startsWith(`g${p.level}-`)) problems.push(`id ${p.id} should look like g${p.level}-shi`);
    if (ids.has(p.id)) problems.push(`duplicate id ${p.id}`);
    ids.add(p.id);
  }
  for (const level of [1, 2]) {
    const n = points.filter((p) => p.level === level).length;
    if (n < 30 || n > 42) problems.push(`HSK ${level} has ${n} points (need 30–42)`);
  }
  const mapped = new Map<string, string>();
  for (const p of points) {
    for (const note of p.lesson_notes) {
      if (!notes.includes(note)) problems.push(`${p.id}: lesson note "${note}" doesn't exist (copy it exactly)`);
      else if (mapped.has(note)) problems.push(`lesson note "${note}" is in both ${mapped.get(note)} and ${p.id}`);
      else mapped.set(note, p.id);
    }
  }
  const unmapped = notes.filter((n) => !mapped.has(n));
  if (unmapped.length) problems.push(`these lesson notes are in no point: ${unmapped.join(' ; ')}`);
  return problems;
}

async function draftGrammarOutline(notes: string[]): Promise<GrammarOutlineEntry[]> {
  const prompt = `Plan the grammar library for HSK 1 and HSK 2 (2026 HSK 3.0 syllabus): about 35 grammar points per level, ordered as they should be learned within each level.

Cover what the HSK 1–2 grammar syllabus expects, for example: word order (subject–time–place–verb), 是 sentences, 有, adjectives as predicates with 很, questions with 吗 / 呢 / question words / A不A / 还是, negation with 不 and 没(有), 了 (completed action and change), 过 (experience), 着, 在 / 正在, measure words, numbers, dates and time, 的 (possession and describing), 和 / 也 / 都 / 还, modal verbs 会 / 能 / 可以 / 想 / 要, 比 comparisons and 一样 / 没有…那么, result and direction complements, degree complements with 得, 把 is HSK 3 (leave it out), 因为…所以…, 虽然…但是…, 一边…一边…, 就 / 才, 再 / 又, verb reduplication (看看), 一点儿 vs 有点儿, 太…了, 吧 / 呢 / 啊, 是…的, imperative 别 / 不要, 快要…了, 从…到…, 离, 对, 给, 跟…一起.

Rules:
- "id": g1-… for HSK 1, g2-… for HSK 2, then a short ASCII slug (g1-shi, g1-ma-questions, g2-guo-experience).
- "title": the pattern plus a few English words, e.g. "是: A is B", "过: have done before".
- "summary": one sentence on what the point lets the learner say.
- "topic": the best-fitting topic slug.
- "lesson_notes": the HSK 1 course already has short grammar notes inside lessons, listed below as "<lesson id>|<title>". Put every note, copied exactly, into the "lesson_notes" of the one point it belongs to (several notes may share a point; most points will have none).

Lesson notes:
${notes.join('\n')}`;
  return (
    await draftChecked<{ points: GrammarOutlineEntry[] }>('grammar outline', prompt, GRAMMAR_OUTLINE_SCHEMA, 'high', (d) =>
      checkGrammarOutline(d.points, notes),
    )
  ).points;
}

// ---------------------------------------------------------------------------
// 2. Grammar points

const EXAMPLE = obj({ zh: str, en: str });
const EXERCISE_SCHEMA = {
  anyOf: [
    obj({ type: { type: 'string', enum: ['fill'] }, en: str, before: str, after: str, options: strs, answer: { type: 'integer' }, why: strs }),
    obj({ type: { type: 'string', enum: ['pick'] }, prompt: str, options: strs, answer: { type: 'integer' }, why: strs }),
    obj({
      type: { type: 'string', enum: ['transform'] },
      instruction: str,
      source: str,
      options: strs,
      answer: { type: 'integer' },
      why: strs,
    }),
    obj({ type: { type: 'string', enum: ['order'] }, en: str, answer: strs, also: { type: 'array', items: strs }, why: str }),
  ],
};
const POINT_SCHEMA = obj({
  structure: strs,
  explanation: str,
  examples: { type: 'array', items: EXAMPLE },
  mistakes: { type: 'array', items: obj({ wrong: str, right: str, why: str }) },
  related: strs,
  exercises: { type: 'array', items: EXERCISE_SCHEMA },
});

const EXERCISE_GUIDE = `Exercise kinds (6–10 exercises, at least 3 kinds, all testing THIS point):
- fill: one gap: "before" + gap + "after" (Chinese), "en" = translation of the full sentence, 3–4 Chinese "options", "answer" = 0-based index.
- pick: "prompt" (English, e.g. "Which sentence is correct?" or "Which means 'I didn't go'?"), 3–4 Chinese sentence "options", only one correct.
- transform: "instruction" (English, e.g. "Make it negative.", "Turn it into a 吗 question."), "source" (a Chinese sentence), 3–4 Chinese "options" (none equal to the source), only one correct.
- order: "en" (English sentence), "answer" = the Chinese translation split into 3–7 word tiles, all different, no punctuation; "also" = other fully correct orders using exactly the same tiles (often []); "why" = one sentence on the word-order rule.
For fill, pick and transform, "why" has one entry per option, in the same order: for the correct option say why it's right; for each wrong option say exactly what is wrong with it and what the rule is (e.g. "没 negates past actions; for habits use 不."). One or two sentences each, English, may quote Chinese.
Wrong options must be plausible learner mistakes (wrong particle, wrong position, 不 vs 没, missing measure word…), not nonsense. Exactly one option is correct.`;

async function draftPoint(entry: GrammarOutlineEntry, outline: GrammarOutlineEntry[], data: ReturnType<typeof loadData>): Promise<GrammarPoint> {
  const vocab = data.upTo(entry.level);
  const ids = new Set(outline.map((p) => p.id));
  const others = outline
    .filter((p) => p.id !== entry.id)
    .map((p) => `${p.id}: ${p.title}`)
    .join('\n');
  const prompt = `Write the grammar point "${entry.title}" (HSK ${entry.level}; ${entry.summary}).

Fields:
- "structure": 1–3 sentence patterns, e.g. "Subject + 是 + Noun", "Subject + 没(有) + Verb (+ Object)".
- "explanation": 2–4 short paragraphs separated by a blank line: what it means, how to build it, when to use it, and any contrast learners mix up.
- "examples": 4–5 natural sentences {zh, en}, from simple to slightly richer.
- "mistakes": 1–3 common learner mistakes {wrong (a Chinese sentence with the mistake), right (the corrected sentence), why (one or two sentences)}.
- "related": 0–4 ids of closely related points from the list below.
- "exercises": see below.

Vocabulary rule: every Chinese sentence (including wrong options and wrong examples) may use only HSK ${entry.level === 1 ? '1' : '1–2'} words (list below). Digits are fine. No people's names: use pronouns, 朋友, 老师, 妈妈 and so on.
Use simplified characters only and never pinyin in Chinese fields (the app adds pinyin).

${EXERCISE_GUIDE}

Other points in the library (for "related"):
${others}

Allowed words (${vocab.length}):
${vocab.map((w) => w.simplified).join(' ')}`;

  const known = data.known[entry.level];
  const draft = await draftChecked<Omit<GrammarPoint, 'id' | 'level' | 'title' | 'topic' | 'summary'>>(
    entry.id,
    prompt,
    POINT_SCHEMA,
    'medium',
    (d) => checkGrammarPoint(full(entry, d), known, data.lex, ids),
  );
  return full(entry, draft);
}

function full(entry: GrammarOutlineEntry, d: Omit<GrammarPoint, 'id' | 'level' | 'title' | 'topic' | 'summary'>): GrammarPoint {
  return {
    id: entry.id,
    level: entry.level,
    title: entry.title,
    topic: entry.topic,
    summary: entry.summary,
    structure: d.structure,
    explanation: d.explanation,
    examples: d.examples,
    mistakes: d.mistakes,
    related: d.related,
    exercises: d.exercises,
  };
}

// ---------------------------------------------------------------------------
// 3–4. Readings

type ReadingOutlineEntry = { id: string; level: 1 | 2; kind: 'story' | 'dialogue'; title: string; summary: string; grammar: string[] };

const READING_OUTLINE_SCHEMA = obj({
  texts: {
    type: 'array',
    items: obj({
      id: str,
      level: { type: 'integer', enum: [1, 2] },
      kind: { type: 'string', enum: ['story', 'dialogue'] },
      title: str,
      summary: str,
      grammar: strs,
    }),
  },
});

function checkReadingOutline(texts: ReadingOutlineEntry[], grammarIds: Set<string>): string[] {
  const problems: string[] = [];
  for (const level of [1, 2] as const) {
    const at = texts.filter((t) => t.level === level);
    if (at.length !== 10) problems.push(`HSK ${level} has ${at.length} texts (need 10)`);
    const stories = at.filter((t) => t.kind === 'story').length;
    if (stories < 4 || stories > 6) problems.push(`HSK ${level} has ${stories} stories (need 4–6, the rest dialogues)`);
    at.forEach((t, i) => {
      const want = `r${level}-${String(i + 1).padStart(2, '0')}`;
      if (t.id !== want) problems.push(`text "${t.title}" should have id ${want}`);
    });
  }
  for (const t of texts) for (const g of t.grammar) if (!grammarIds.has(g)) problems.push(`${t.id}: grammar point ${g} doesn't exist`);
  return problems;
}

async function draftReadingOutline(grammar: GrammarOutlineEntry[]): Promise<ReadingOutlineEntry[]> {
  const prompt = `Plan 20 graded reading texts: 10 for HSK 1 (ids r1-01 … r1-10) and 10 for HSK 2 (r2-01 … r2-10), easiest first within each level. Each level: 4–6 short stories (narrated, e.g. "My weekend", a diary, a note to a friend) and the rest dialogues (two people: at a shop, at school, on the phone, ordering food, asking the way, making plans…). Vary the everyday topics.

Fields: "title" (short English), "summary" (one sentence: what happens), "grammar" (2–4 ids of grammar points from the list below that the text naturally practises; HSK 1 texts use HSK 1 points only).

Grammar points:
${grammar.map((p) => `${p.id} (HSK ${p.level}): ${p.title}`).join('\n')}`;
  return (
    await draftChecked<{ texts: ReadingOutlineEntry[] }>('reading outline', prompt, READING_OUTLINE_SCHEMA, 'medium', (d) =>
      checkReadingOutline(d.texts, new Set(grammar.map((p) => p.id))),
    )
  ).texts;
}

const READING_SCHEMA = obj({
  title_zh: str,
  speakers: { type: 'array', items: obj({ name: str, voice: { type: 'string', enum: ['female', 'male'] } }) },
  names: strs,
  new_words: { type: 'array', items: obj({ word: str, en: str }) },
  sentences: { type: 'array', items: { anyOf: [obj({ zh: str, en: str }), obj({ zh: str, en: str, speaker: { type: 'integer' } })] } },
  questions: { type: 'array', items: obj({ prompt: str, options: strs, answer: { type: 'integer' }, why: strs }) },
});

async function draftReading(entry: ReadingOutlineEntry, grammar: GrammarOutlineEntry[], data: ReturnType<typeof loadData>): Promise<ReadingText> {
  const vocab = data.upTo(entry.level);
  const [min, max] = READING_LENGTH[entry.level];
  const points = grammar.filter((p) => entry.grammar.includes(p.id));
  const prompt = `Write the HSK ${entry.level} ${entry.kind} "${entry.title}": ${entry.summary}

Length: ${min}–${max} Chinese characters in total, ${entry.kind === 'dialogue' ? '8–16 lines' : '6–14 sentences'}.
Grammar to use naturally: ${points.map((p) => p.title).join('; ')}.

Fields:
- "title_zh": a 2–8 character Chinese title.
- ${entry.kind === 'dialogue' ? '"speakers": exactly two {name, voice}: short Chinese names (e.g. 小明, 王老师, 大卫) or roles made of allowed words (服务员), one "female" and one "male" voice. Every sentence has "speaker" = 0 or 1, alternating as in a real conversation.' : '"speakers": [] (a story has none), and sentences have no "speaker". Tell it in the first person or about 他 / 她 / a named person.'}
- "names": every person's name used anywhere in the text (including the speakers' names), else [].
- "new_words": at most 3 words above HSK ${entry.level} that the text really needs, each with a short English gloss; prefer none.
- "sentences": {zh, en${entry.kind === 'dialogue' ? ', speaker' : ''}}: one sentence (or one short turn) per entry, with natural English.
- "questions": 3–5 comprehension questions in English about what the text says, each with 3–4 "options" (English, or Chinese words from the text), "answer" (0-based) and "why" (one entry per option: where the text gives the answer, or why that option is wrong).

Vocabulary rule: all Chinese may use only HSK ${entry.level === 1 ? '1' : '1–2'} words (list below), the names you list, and "new_words". Digits are fine. Simplified characters only, never pinyin.

Allowed words (${vocab.length}):
${vocab.map(describe).join('\n')}`;

  const known = data.known[entry.level];
  const draft = await draftChecked<Omit<ReadingText, 'id' | 'level' | 'kind' | 'title' | 'summary'>>(
    entry.id,
    prompt,
    READING_SCHEMA,
    'medium',
    (d) => checkReading(fullReading(entry, d), known, data.lex),
  );
  return fullReading(entry, draft);
}

function fullReading(entry: ReadingOutlineEntry, d: Omit<ReadingText, 'id' | 'level' | 'kind' | 'title' | 'summary'>): ReadingText {
  return {
    id: entry.id,
    level: entry.level,
    kind: entry.kind,
    title: entry.title,
    title_zh: d.title_zh,
    summary: entry.summary,
    speakers: d.speakers,
    names: d.names,
    new_words: d.new_words,
    sentences: d.sentences,
    questions: d.questions,
  };
}

// ---------------------------------------------------------------------------

async function inParallel<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  let failures = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        try {
          await fn(item);
        } catch (e) {
          failures++;
          console.error(`  ✖ ${e instanceof Error ? e.message : e}`);
        }
      }
    }),
  );
  return failures;
}

const write = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8'));

async function main() {
  mkdirSync(GRAMMAR_DIR, { recursive: true });
  mkdirSync(READING_DIR, { recursive: true });
  const data = loadData();
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

  const grammarOutlineFile = join(GRAMMAR_DIR, 'outline.json');
  let grammar: GrammarOutlineEntry[];
  if (existsSync(grammarOutlineFile)) grammar = read<{ points: GrammarOutlineEntry[] }>(grammarOutlineFile).points;
  else {
    grammar = await draftGrammarOutline(lessonNotes());
    write(grammarOutlineFile, { points: grammar });
    console.log(`✔ grammar outline: ${grammar.length} points`);
  }

  let failures = 0;
  if (only !== 'reading') {
    const todo = grammar.filter((p) => !existsSync(join(GRAMMAR_DIR, `${p.id}.json`)));
    console.log(`Drafting ${todo.length} of ${grammar.length} grammar points…`);
    failures += await inParallel(todo, CONCURRENCY, async (entry) => {
      const point = await draftPoint(entry, grammar, data);
      write(join(GRAMMAR_DIR, `${point.id}.json`), point);
      console.log(`  ✔ ${point.id} (${point.exercises.length} exercises)`);
    });
  }

  if (only !== 'grammar') {
    const readingOutlineFile = join(READING_DIR, 'outline.json');
    let texts: ReadingOutlineEntry[];
    if (existsSync(readingOutlineFile)) texts = read<{ texts: ReadingOutlineEntry[] }>(readingOutlineFile).texts;
    else {
      texts = await draftReadingOutline(grammar);
      write(readingOutlineFile, { texts });
      console.log(`✔ reading outline: ${texts.length} texts`);
    }
    const todo = texts.filter((t) => !existsSync(join(READING_DIR, `${t.id}.json`)));
    console.log(`Drafting ${todo.length} of ${texts.length} readings…`);
    failures += await inParallel(todo, CONCURRENCY, async (entry) => {
      const text = await draftReading(entry, grammar, data);
      write(join(READING_DIR, `${text.id}.json`), text);
      console.log(`  ✔ ${text.id} (${text.sentences.length} sentences)`);
    });
  }

  const cost = (spent.input * 4 + spent.output * 20) / 1_000_000;
  console.log(`\nTokens: ${spent.input} in, ${spent.output} out (≈ $${cost.toFixed(2)})`);
  if (failures) console.log(`${failures} drafts failed; run again to retry them.`);
}

main().catch((err) => {
  if (err instanceof Anthropic.AuthenticationError) {
    console.error('No valid Anthropic API key. Set ANTHROPIC_API_KEY or put it in scripts/.env.');
  } else {
    console.error(err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
