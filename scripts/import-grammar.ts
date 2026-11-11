/**
 * Loads the grammar library (content/grammar/), the graded readings (content/reading/), the mock
 * HSK tests (content/mock/) and the tutor's role-play scenarios (content/tutor/) into
 * Supabase, called from import-vocab.ts. Adds what authors don't write by hand: pinyin and
 * traditional characters for every Chinese text, and (readings) a meaning for every word so
 * learners can tap words. Rows are upserted by id, so learners' progress is kept.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';

import { grammarRow, readingRow, readingsFor, scenarioRow } from '../src/lib/content-rows.ts';
import { checkGrammarPoint, checkReading, type GrammarOutlineEntry, type GrammarPoint, type ReadingText } from '../src/lib/grammar.ts';
import { checkMock, mockTexts, type MockTest } from '../src/lib/mock-test.ts';
import { buildLexicon, buildTradToSimp } from '../src/lib/sentences.ts';
import { checkScenarios, type Scenario } from '../src/lib/tutor.ts';
import type { DictionaryRow, WordRow } from '../src/lib/vocab-parsers.ts';

/** Lesson id → grammar point id, from the grammar outline's lesson_notes ("<lesson>|<title>"). */
export function lessonGrammarLinks(root: string): Map<string, string> {
  const file = join(root, 'content', 'grammar', 'outline.json');
  const links = new Map<string, string>();
  if (!existsSync(file)) return links;
  const { points } = JSON.parse(readFileSync(file, 'utf8')) as { points: GrammarOutlineEntry[] };
  for (const p of points) for (const note of p.lesson_notes) links.set(note, p.id);
  return links;
}

export async function importGrammar(db: SupabaseClient, root: string, words: WordRow[], cedict: DictionaryRow[], skip: Set<string> = new Set()) {
  const grammarDir = join(root, 'content', 'grammar');
  const readingDir = join(root, 'content', 'reading');
  const lex = buildLexicon(
    words.map((w) => ({ simplified: w.simplified, traditional: w.traditional, pinyin: w.pinyin, level: w.hsk_level })),
    cedict,
  );
  const t2s = buildTradToSimp(cedict);
  const upTo = (level: number) => new Set(words.filter((w) => w.hsk_level !== null && w.hsk_level <= level).map((w) => w.simplified));

  // Grammar points
  const outlineFile = join(grammarDir, 'outline.json');
  if (existsSync(outlineFile)) {
    const { points: outline } = JSON.parse(readFileSync(outlineFile, 'utf8')) as { points: GrammarOutlineEntry[] };
    const ids = new Set(outline.map((p) => p.id));
    const rows = [];
    let problems = 0;
    for (const [i, entry] of outline.entries()) {
      const file = join(grammarDir, `${entry.id}.json`);
      if (!existsSync(file)) continue;
      const point: GrammarPoint = JSON.parse(readFileSync(file, 'utf8'));
      const found = checkGrammarPoint(point, upTo(point.level), lex, ids);
      if (found.length) {
        problems++;
        console.warn(`  ${point.id}: ${found.length} problems (first: ${found[0]})`);
      }
      if (skip.has(`grammar:${point.id}`)) continue;
      rows.push(grammarRow(point, i + 1, ids, [...new Set(entry.lesson_notes.map((n) => n.split('|')[0]))], lex, t2s));
    }
    const { error } = await db.from('grammar_points').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`grammar_points: ${error.message}`);
    console.log(`✔ grammar: ${rows.length} points${problems ? ` (${problems} with problems)` : ''}`);
  }

  // Readings
  const readingOutline = join(readingDir, 'outline.json');
  if (existsSync(readingOutline)) {
    const { texts: outline } = JSON.parse(readFileSync(readingOutline, 'utf8')) as {
      texts: { id: string; grammar: string[] }[];
    };
    const meanings = new Map<string, string[]>();
    for (const e of cedict) if (!meanings.has(e.simplified)) meanings.set(e.simplified, e.definitions.slice(0, 3));
    for (const w of words) meanings.set(w.simplified, w.meanings.slice(0, 3));

    const rows = [];
    for (const [i, entry] of outline.entries()) {
      const file = join(readingDir, `${entry.id}.json`);
      if (!existsSync(file)) continue;
      const text: ReadingText = JSON.parse(readFileSync(file, 'utf8'));
      const found = checkReading(text, upTo(text.level), lex);
      if (found.length) console.warn(`  ${text.id}: ${found.length} problems (first: ${found[0]})`);
      if (skip.has(`reading:${text.id}`)) continue;
      rows.push(readingRow(text, i + 1, entry.grammar, lex, t2s, meanings));
    }
    const { error } = await db.from('reading_texts').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`reading_texts: ${error.message}`);
    console.log(`✔ reading: ${rows.length} texts`);
  }

  // Mock HSK tests
  const mockRows = [];
  for (const level of [1, 2]) {
    const file = join(root, 'content', 'mock', `hsk${level}.json`);
    if (!existsSync(file)) continue;
    const test: MockTest = JSON.parse(readFileSync(file, 'utf8'));
    const found = checkMock(test, upTo(level), lex);
    if (found.length) console.warn(`  mock ${test.id}: ${found.length} problems (first: ${found[0]})`);
    mockRows.push({
      id: test.id,
      hsk_level: test.level,
      title: test.title,
      minutes: test.minutes,
      sections: test.sections,
      readings: readingsFor(mockTexts(test).map((t) => t.replace(/___/g, '')), lex, t2s),
    });
  }
  if (mockRows.length) {
    const { error } = await db.from('mock_tests').upsert(mockRows, { onConflict: 'id' });
    if (error) throw new Error(`mock_tests: ${error.message}`);
    console.log(`✔ mock tests: ${mockRows.length}`);
  }

  // Role-play scenarios for the AI tutor
  const scenarioFile = join(root, 'content', 'tutor', 'scenarios.json');
  if (existsSync(scenarioFile)) {
    const { scenarios } = JSON.parse(readFileSync(scenarioFile, 'utf8')) as { scenarios: Scenario[] };
    const found = checkScenarios(scenarios, upTo, lex);
    if (found.length) console.warn(`  scenarios: ${found.length} problems (first: ${found[0]})`);
    const rows = scenarios.flatMap((s, i) => (skip.has(`scenario:${s.id}`) ? [] : [scenarioRow(s, i + 1, lex, t2s)]));
    const { error } = await db.from('tutor_scenarios').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`tutor_scenarios: ${error.message}`);
    console.log(`✔ tutor scenarios: ${rows.length}`);
  }
}
