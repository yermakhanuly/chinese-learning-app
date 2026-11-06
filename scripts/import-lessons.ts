/**
 * Loads the course (content/hskN/outline.json + one JSON file per lesson) into Supabase,
 * called from import-vocab.ts. Adds what authors don't write by hand:
 *   - readings: pinyin + traditional characters for every Chinese text in the lesson
 *   - word_details: dictionary entry and an example sentence for each new word
 * Lessons are upserted by id and never deleted here, so learners' progress is kept.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';

import { lessonGrammarLinks } from './import-grammar.ts';

import { checkCourse, chineseTexts, type Course, type Lesson, type Step } from '../src/lib/lessons.ts';
import { buildLexicon, buildTradToSimp, tokenize, type Token } from '../src/lib/sentences.ts';
import type { DictionaryRow, WordRow } from '../src/lib/vocab-parsers.ts';

type OutlineUnit = { id: string; title: string; title_zh: string; theme: string; description: string; lessons: { id: string }[] };

/** Every Chinese string a learner sees in a step, including single tiles and options. */
function allChinese(step: Step): string[] {
  const texts = chineseTexts(step);
  if (step.type === 'build' && step.direction === 'en-zh') texts.push(...step.answer, ...step.distractors);
  if (step.type === 'fill') texts.push(step.before, step.after);
  if (step.type === 'grammar') texts.push(...step.examples.map((e) => e.zh));
  return texts.filter((t) => /[㐀-鿿]/.test(t));
}

export async function importLessons(db: SupabaseClient, root: string, words: WordRow[], cedict: DictionaryRow[]) {
  const contentDir = join(root, 'content');
  if (!existsSync(contentDir)) return;
  const lex = buildLexicon(
    words.map((w) => ({ simplified: w.simplified, traditional: w.traditional, pinyin: w.pinyin, level: w.hsk_level })),
    cedict,
  );
  const t2s = buildTradToSimp(cedict);
  const byWord = new Map(words.map((w) => [w.simplified, w]));
  // Grammar notes link to their page in the grammar library.
  const grammarLinks = lessonGrammarLinks(root);

  for (const dir of readdirSync(contentDir).filter((d) => /^hsk\d$/.test(d)).sort()) {
    const level = Number(dir.slice(3));
    const outlineFile = join(contentDir, dir, 'outline.json');
    if (!existsSync(outlineFile)) continue;
    const outline: { units: OutlineUnit[] } = JSON.parse(readFileSync(outlineFile, 'utf8'));

    const course: Course = {
      level,
      units: outline.units.map((u) => ({
        ...u,
        lessons: [...u.lessons.map((l) => l.id), `${u.id}-quiz`]
          .map((id) => join(contentDir, dir, `${id}.json`))
          .filter((f) => existsSync(f))
          .map((f) => JSON.parse(readFileSync(f, 'utf8')) as Lesson),
      })),
    };
    const target = words.filter((w) => w.hsk_level === level).map((w) => w.simplified);
    const problems = checkCourse(course, target, lex);
    if (problems.length) console.warn(`  ${dir}: ${problems.length} content problems (first: ${problems[0]})`);

    // Example sentence for each new word: the first one linked in the dictionary.
    const newWords = course.units.flatMap((u) => u.lessons.flatMap((l) => l.words));
    const examples = new Map<string, { simplified: string; traditional: string; english: string; tokens: Token[] }>();
    for (let i = 0; i < newWords.length; i += 100) {
      const { data, error } = await db
        .from('words')
        .select('simplified, word_sentences(position, sentences(simplified, traditional, english, tokens))')
        .in('simplified', newWords.slice(i, i + 100));
      if (error) throw new Error(`reading examples: ${error.message}`);
      for (const row of data as unknown as {
        simplified: string;
        word_sentences: { position: number; sentences: { simplified: string; traditional: string; english: string; tokens: Token[] } }[];
      }[]) {
        const first = [...row.word_sentences].sort((a, b) => a.position - b.position)[0];
        if (first) examples.set(row.simplified, first.sentences);
      }
    }

    const unitRows = course.units.map((u, i) => ({
      id: u.id,
      hsk_level: level,
      position: i + 1,
      title: u.title,
      title_zh: u.title_zh,
      theme: u.theme,
      description: u.description,
    }));
    const { error: unitError } = await db.from('units').upsert(unitRows, { onConflict: 'id' });
    if (unitError) throw new Error(`units: ${unitError.message}`);

    const lessonRows = course.units.flatMap((u) =>
      u.lessons.map((l, i) => {
        const readings: Record<string, Token[]> = {};
        for (const text of new Set(l.steps.flatMap(allChinese))) {
          const tokens = tokenize(text, lex, t2s);
          if (tokens) readings[text] = tokens;
        }
        const wordDetails = Object.fromEntries(
          l.words.map((w) => {
            const row = byWord.get(w)!;
            return [
              w,
              {
                traditional: row.traditional,
                pinyin: row.pinyin,
                meanings: row.meanings.slice(0, 4),
                classifiers: row.classifiers,
                example: examples.get(w) ?? null,
              },
            ];
          }),
        );
        return {
          id: l.id,
          unit_id: u.id,
          position: i + 1,
          title: l.title,
          kind: l.kind,
          words: l.words,
          steps: l.steps.map((s) => {
            const grammarId = s.type === 'grammar' ? grammarLinks.get(`${l.id}|${s.title}`) : undefined;
            return grammarId ? { ...s, grammar_id: grammarId } : s;
          }),
          readings,
          word_details: wordDetails,
          minutes: Math.max(2, Math.round(l.steps.length * 0.35)),
        };
      }),
    );
    const { error: lessonError } = await db.from('lessons').upsert(lessonRows, { onConflict: 'id' });
    if (lessonError) throw new Error(`lessons: ${lessonError.message}`);
    console.log(`✔ ${dir}: ${unitRows.length} units, ${lessonRows.length} lessons and quizzes`);
  }
}
