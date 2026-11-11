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

import { lessonRow, type ExampleRow } from '../src/lib/content-rows.ts';
import { checkCourse, type Course, type Lesson } from '../src/lib/lessons.ts';
import { buildLexicon, buildTradToSimp } from '../src/lib/sentences.ts';
import type { DictionaryRow, WordRow } from '../src/lib/vocab-parsers.ts';

type OutlineUnit = { id: string; title: string; title_zh: string; theme: string; description: string; lessons: { id: string }[] };

export async function importLessons(db: SupabaseClient, root: string, words: WordRow[], cedict: DictionaryRow[], skip: Set<string> = new Set()) {
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
    const examples = new Map<string, ExampleRow>();
    for (let i = 0; i < newWords.length; i += 100) {
      const { data, error } = await db
        .from('words')
        .select('simplified, word_sentences(position, sentences(simplified, traditional, english, tokens))')
        .in('simplified', newWords.slice(i, i + 100));
      if (error) throw new Error(`reading examples: ${error.message}`);
      for (const row of data as unknown as {
        simplified: string;
        word_sentences: { position: number; sentences: ExampleRow }[];
      }[]) {
        const first = [...row.word_sentences].sort((a, b) => a.position - b.position)[0];
        if (first) examples.set(row.simplified, first.sentences);
      }
    }

    const unitRows = course.units.flatMap((u, i) => skip.has(`unit:${u.id}`) ? [] : [{
      id: u.id,
      hsk_level: level,
      position: i + 1,
      title: u.title,
      title_zh: u.title_zh,
      theme: u.theme,
      description: u.description,
    }]);
    const { error: unitError } = await db.from('units').upsert(unitRows, { onConflict: 'id' });
    if (unitError) throw new Error(`units: ${unitError.message}`);

    const lessonRows = course.units.flatMap((u) =>
      u.lessons.flatMap((l, i) =>
        skip.has(`lesson:${l.id}`) ? [] : [lessonRow(l, u.id, i + 1, lex, t2s, byWord, examples, grammarLinks)],
      ),
    );
    const { error: lessonError } = await db.from('lessons').upsert(lessonRows, { onConflict: 'id' });
    if (lessonError) throw new Error(`lessons: ${lessonError.message}`);
    console.log(`✔ ${dir}: ${unitRows.length} units, ${lessonRows.length} lessons and quizzes`);
  }
}
