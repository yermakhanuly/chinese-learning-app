/**
 * Drafts the HSK 1 course with Claude, checked by src/lib/lessons.ts.
 *
 *   npm run content:draft            # needs ANTHROPIC_API_KEY (env, or scripts/.env)
 *
 * 1. Outline (content/hsk1/outline.json): themed units → lessons, each teaching 5–9 HSK 1 words,
 *    every HSK 1 word exactly once, plus the grammar point each lesson introduces.
 * 2. Each lesson and end-of-unit quiz (content/hsk1/<id>.json), using only words taught so far.
 *    Drafts that fail the checker go back to Claude with the problems listed (up to 3 tries).
 *
 * Existing files are kept, so re-running only drafts what's missing; delete a file to redo it.
 * Content files are committed; `npm run data:import` loads them into the database.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Anthropic from '@anthropic-ai/sdk';

import { TOPICS } from '../src/constants/topics.ts';
import { checkCourse, checkLesson, type Course, type Lesson, type Step, type Unit } from '../src/lib/lessons.ts';
import { buildLexicon } from '../src/lib/sentences.ts';
import { parseCedictLine, parseHskEntry, type HskSourceEntry, type WordRow } from '../src/lib/vocab-parsers.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEVEL = 1;
const DIR = join(ROOT, 'content', `hsk${LEVEL}`);
const OUTLINE_FILE = join(DIR, 'outline.json');
const MODEL = 'claude-opus-5-5';
const CONCURRENCY = 6;
const MAX_TRIES = 3;

const client = new Anthropic();

// ---------------------------------------------------------------------------
// Data

type OutlineLesson = { id: string; title: string; words: string[]; grammar: string };
type OutlineUnit = Omit<Unit, 'lessons'> & { lessons: OutlineLesson[] };
type Outline = { units: OutlineUnit[] };

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
  const target = words.filter((w) => w.hsk_level === LEVEL).sort((a, b) => (a.frequency ?? 1e9) - (b.frequency ?? 1e9));
  return { lex, target, byWord: new Map(words.map((w) => [w.simplified, w])) };
}

const describe = (w: WordRow) => `${w.simplified} (${w.pinyin}): ${w.meanings.slice(0, 3).join('; ')}`;

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

const spent = { input: 0, output: 0 };

const AUTHOR = `You write lessons for a Mandarin course app for adult beginners whose explanations are in English. The course follows the official 2026 HSK 3.0 syllabus. You are careful: learners trust that every sentence is natural, correct Mandarin and uses only words they have already met.`;

// ---------------------------------------------------------------------------
// 1. Outline

const OUTLINE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['units'],
  properties: {
    units: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'title_zh', 'theme', 'description', 'lessons'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          title_zh: { type: 'string' },
          theme: { type: 'string', enum: TOPICS.map((t) => t.slug) },
          description: { type: 'string' },
          lessons: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'title', 'words', 'grammar'],
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                words: { type: 'array', items: { type: 'string' } },
                grammar: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

function checkOutline(outline: Outline, target: string[]): string[] {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  const targetSet = new Set(target);
  for (const u of outline.units) {
    if (!/^hsk1-u\d{2}$/.test(u.id)) problems.push(`unit id ${u.id} should look like hsk1-u01`);
    for (const l of u.lessons) {
      if (!l.id.startsWith(`${u.id}-l`)) problems.push(`lesson id ${l.id} should look like ${u.id}-l1`);
      if (l.words.length < 5 || l.words.length > 9) problems.push(`${l.id} teaches ${l.words.length} words (need 5–9)`);
      for (const w of l.words) {
        if (!targetSet.has(w)) problems.push(`${l.id}: ${w} is not an HSK ${LEVEL} word`);
        else if (seen.has(w)) problems.push(`${w} is in both ${seen.get(w)} and ${l.id}`);
        seen.set(w, l.id);
      }
    }
  }
  const missing = target.filter((w) => !seen.has(w));
  if (missing.length) problems.push(`these words are in no lesson: ${missing.join(' ')}`);
  return problems;
}

async function draftOutline(target: WordRow[]): Promise<Outline> {
  const prompt = `Plan the HSK ${LEVEL} course: about 10 themed units (greetings & introductions, numbers & dates, family, food & drink, shopping & money, time & daily routine, school & work, places & transport, weather & feelings, hobbies…), each with 3–5 short lessons. Each lesson teaches 5–9 new words and at most one grammar point.

Rules:
- Every word in the list below appears in exactly one lesson's "words", spelled exactly as given. No other words.
- Order from most basic to more advanced: a lesson's words and grammar should be usable with what came before (greetings and pronouns first; 是, 不, 吗 early).
- Group words that work together in sentences, matching the unit theme.
- "grammar": the grammar point the lesson introduces in a few words (e.g. "是 sentences: A 是 B", "questions with 吗", "measure word 个"), or "" for none.
- ids: units hsk1-u01, hsk1-u02, …; lessons hsk1-u01-l1, hsk1-u01-l2, …
- theme: the topic slug that fits the unit best.
- title: short English title; title_zh: 2–6 character Chinese title using HSK 1 words; description: one sentence on what the learner will be able to do.

HSK ${LEVEL} words (${target.length}, most frequent first):
${target.map(describe).join('\n')}`;

  let feedback = '';
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    console.log(`Outline, attempt ${attempt}…`);
    const outline = await ask<Outline>(AUTHOR, prompt + feedback, OUTLINE_SCHEMA, 'high');
    const problems = checkOutline(
      outline,
      target.map((w) => w.simplified),
    );
    if (!problems.length) return outline;
    console.log(`  ${problems.length} problems; asking for a fix`);
    feedback = `\n\nYour previous outline had these problems. Return a corrected full outline:\n- ${problems.join('\n- ')}\n\nPrevious outline:\n${JSON.stringify(outline)}`;
  }
  throw new Error('Outline still has problems after 3 tries');
}

// ---------------------------------------------------------------------------
// 2. Lessons

const STEP_SCHEMA = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'word'],
      properties: { type: { type: 'string', enum: ['word'] }, word: { type: 'string' } },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'title', 'body', 'examples'],
      properties: {
        type: { type: 'string', enum: ['grammar'] },
        title: { type: 'string' },
        body: { type: 'string' },
        examples: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['zh', 'en'],
            properties: { zh: { type: 'string' }, en: { type: 'string' } },
          },
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'prompt', 'zh', 'listen', 'options', 'answer'],
      properties: {
        type: { type: 'string', enum: ['choice'] },
        prompt: { type: 'string' },
        zh: { type: 'string' },
        listen: { type: 'boolean' },
        options: { type: 'array', items: { type: 'string' } },
        answer: { type: 'integer' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'en', 'before', 'after', 'options', 'answer'],
      properties: {
        type: { type: 'string', enum: ['fill'] },
        en: { type: 'string' },
        before: { type: 'string' },
        after: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
        answer: { type: 'integer' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'direction', 'source', 'answer', 'also', 'distractors'],
      properties: {
        type: { type: 'string', enum: ['build'] },
        direction: { type: 'string', enum: ['en-zh', 'zh-en'] },
        source: { type: 'string' },
        answer: { type: 'array', items: { type: 'string' } },
        also: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
        distractors: { type: 'array', items: { type: 'string' } },
      },
    },
  ],
};

const LESSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['steps'],
  properties: { steps: { type: 'array', items: STEP_SCHEMA } },
};

const STEP_GUIDE = `Step types (all Chinese in simplified characters, never pinyin; the app adds pinyin itself):
- word: introduces one new word. The app shows its pinyin, meaning, audio and an example.
- grammar: "title", a short plain-English "body" (2–5 sentences, no jargon), and 2–3 "examples" {zh, en}.
- choice: multiple choice with 3–4 "options" and the 0-based index of the correct one in "answer". Use it three ways:
  · meaning: zh = a Chinese word or sentence, prompt "What does this mean?", options = English.
  · recall: zh = "", prompt "Which word means 'X'?", options = Chinese words.
  · listening: listen = true, zh = the Chinese the app plays aloud (hidden), prompt "What did you hear?", options = English meanings or Chinese words.
  listen is false for the first two. Wrong options must be plausible (same kind of word), and only one option may be correct.
- fill: a Chinese sentence with one gap: "before" + gap + "after", "en" = translation of the full sentence, 3–4 Chinese "options", "answer" = index.
- build: arrange word tiles into a translation.
  · en-zh: source = English sentence, answer = the Chinese translation split into words (one tile per word, no punctuation), distractors = 1–3 Chinese words that don't belong.
  · zh-en: source = Chinese sentence, answer = English translation split into single words (no punctuation, normal capitalisation), distractors = 1–3 English words.
  "also" lists other fully correct tile orders using exactly the same tiles (often []).`;

async function draftLesson(
  unit: OutlineUnit,
  lesson: OutlineLesson,
  kind: 'lesson' | 'quiz',
  known: Set<string>,
  data: ReturnType<typeof loadData>,
): Promise<Lesson> {
  const newWords = lesson.words.map((w) => data.byWord.get(w)!);
  const knownList = [...known].join(' ');
  const task =
    kind === 'lesson'
      ? `Write lesson "${lesson.title}" (unit "${unit.title}": ${unit.description}).

New words (introduce each with a "word" step):
${newWords.map(describe).join('\n')}
${lesson.grammar ? `\nGrammar point to teach with one "grammar" step: ${lesson.grammar}\n` : ''}
Shape: about 5 minutes. Introduce 2–3 new words, then practise them right away, then the next words, and so on. Put the grammar note where it's first needed. End with a few exercises that combine this lesson's words with earlier ones. Use each new word in at least two exercises. 10–14 exercises in total, mixing all kinds: meaning, recall, listening, fill, build en-zh and build zh-en (at least 2 builds).`
      : `Write the end-of-unit quiz for unit "${unit.title}" (${unit.description}). It tests the words of the whole unit:
${newWords.map(describe).join('\n')}

Only exercises (no word or grammar steps): 12–15 of them, mixing meaning, recall, listening, fill, and build in both directions, focusing on sentences that combine the unit's words.`;

  const prompt = `${task}

Vocabulary rule: Chinese text may only use the new words above and these words the learner already knows: ${knownList || '(none yet)'}.
Numbers written as digits are fine. Use no names; use pronouns (我, 你, 他…) or words for people the learner knows.
Keep sentences short and natural, as a native speaker would say them.

${STEP_GUIDE}`;

  let feedback = '';
  const vocab = new Set(known);
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const { steps } = await ask<{ steps: Step[] }>(AUTHOR, prompt + feedback, LESSON_SCHEMA, 'medium');
    const draft: Lesson = {
      id: lesson.id,
      title: lesson.title,
      kind,
      words: kind === 'lesson' ? lesson.words : [],
      steps,
    };
    const checkKnown = kind === 'quiz' ? new Set([...vocab, ...lesson.words]) : vocab;
    const problems = checkLesson(draft, checkKnown, data.lex);
    if (!problems.length) return draft;
    console.log(`  ${lesson.id}: attempt ${attempt} has ${problems.length} problems`);
    feedback = `\n\nYour previous draft had these problems. Return a corrected full lesson:\n- ${problems.join('\n- ')}\n\nPrevious draft:\n${JSON.stringify(steps)}`;
  }
  throw new Error(`${lesson.id} still has problems after ${MAX_TRIES} tries`);
}

async function inParallel<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  const failures: unknown[] = [];
  await Promise.all(
    Array.from({ length: limit }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        try {
          await fn(item);
        } catch (e) {
          failures.push(e);
          console.error(`  ✖ ${e instanceof Error ? e.message : e}`);
        }
      }
    }),
  );
  return failures;
}

// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(DIR, { recursive: true });
  const data = loadData();

  let outline: Outline;
  if (existsSync(OUTLINE_FILE)) {
    outline = JSON.parse(readFileSync(OUTLINE_FILE, 'utf8'));
  } else {
    outline = await draftOutline(data.target);
    writeFileSync(OUTLINE_FILE, JSON.stringify(outline, null, 2) + '\n');
    console.log(`✔ outline: ${outline.units.length} units, ${outline.units.flatMap((u) => u.lessons).length} lessons`);
  }

  // Known words before each lesson follow the outline order, so lessons can be drafted in parallel.
  type Job = { unit: OutlineUnit; lesson: OutlineLesson; kind: 'lesson' | 'quiz'; known: Set<string> };
  const jobs: Job[] = [];
  const known = new Set<string>();
  for (const unit of outline.units) {
    const unitWords: string[] = [];
    for (const lesson of unit.lessons) {
      jobs.push({ unit, lesson, kind: 'lesson', known: new Set(known) });
      lesson.words.forEach((w) => {
        known.add(w);
        unitWords.push(w);
      });
    }
    const quiz: OutlineLesson = { id: `${unit.id}-quiz`, title: `${unit.title}: quiz`, words: unitWords, grammar: '' };
    jobs.push({ unit, lesson: quiz, kind: 'quiz', known: new Set([...known].filter((w) => !unitWords.includes(w))) });
  }

  const todo = jobs.filter((j) => !existsSync(join(DIR, `${j.lesson.id}.json`)));
  console.log(`Drafting ${todo.length} of ${jobs.length} lessons and quizzes…`);
  const failures = await inParallel(todo, CONCURRENCY, async (job) => {
    const lesson = await draftLesson(job.unit, job.lesson, job.kind, job.known, data);
    writeFileSync(join(DIR, `${lesson.id}.json`), JSON.stringify(lesson, null, 2) + '\n');
    console.log(`  ✔ ${lesson.id} (${lesson.steps.length} steps)`);
  });

  // Whole-course check on what exists.
  const course: Course = {
    level: LEVEL,
    units: outline.units.map((u) => ({
      ...u,
      lessons: [...u.lessons.map((l) => l.id), `${u.id}-quiz`]
        .filter((id) => existsSync(join(DIR, `${id}.json`)))
        .map((id) => JSON.parse(readFileSync(join(DIR, `${id}.json`), 'utf8')) as Lesson),
    })),
  };
  const problems = checkCourse(
    course,
    data.target.map((w) => w.simplified),
    data.lex,
  );
  const cost = (spent.input * 4 + spent.output * 20) / 1_000_000;
  console.log(`\nTokens: ${spent.input} in, ${spent.output} out (≈ $${cost.toFixed(2)})`);
  if (failures.length) console.log(`${failures.length} lessons failed; run again to retry them.`);
  console.log(problems.length ? `Course check:\n- ${problems.join('\n- ')}` : '✔ course check passed');
}

main().catch((err) => {
  if (err instanceof Anthropic.AuthenticationError) {
    console.error('No valid Anthropic API key. Set ANTHROPIC_API_KEY or put it in scripts/.env.');
  } else {
    console.error(err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
