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

import {
  checkGrammarPoint,
  checkReading,
  grammarTexts,
  readingTexts,
  type GrammarOutlineEntry,
  type GrammarPoint,
  type ReadingText,
} from '../src/lib/grammar.ts';
import { checkMock, mockTexts, type MockTest } from '../src/lib/mock-test.ts';
import { buildLexicon, buildTradToSimp, hanCount, tokenize, type Lexicon, type Token } from '../src/lib/sentences.ts';
import { checkScenarios, scenarioTexts, type Scenario } from '../src/lib/tutor.ts';
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

function readingsFor(texts: string[], lex: Lexicon, t2s: Map<string, string>): Record<string, Token[]> {
  const out: Record<string, Token[]> = {};
  for (const text of new Set(texts)) {
    const tokens = tokenize(text, lex, t2s);
    if (tokens) out[text] = tokens;
  }
  return out;
}

export async function importGrammar(db: SupabaseClient, root: string, words: WordRow[], cedict: DictionaryRow[]) {
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
      rows.push({
        id: point.id,
        hsk_level: point.level,
        position: i + 1,
        title: point.title,
        topic: point.topic,
        summary: point.summary,
        structure: point.structure,
        explanation: point.explanation,
        examples: point.examples,
        mistakes: point.mistakes,
        related: point.related.filter((r) => ids.has(r)),
        exercises: point.exercises,
        readings: readingsFor(grammarTexts(point), lex, t2s),
        lessons: [...new Set(entry.lesson_notes.map((n) => n.split('|')[0]))],
      });
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
      rows.push({
        id: text.id,
        hsk_level: text.level,
        position: i + 1,
        kind: text.kind,
        title: text.title,
        title_zh: text.title_zh,
        summary: text.summary,
        speakers: text.speakers,
        sentences: text.sentences,
        questions: text.questions,
        new_words: text.new_words,
        grammar: entry.grammar,
        readings,
        word_details: wordDetails,
        char_count: text.sentences.reduce((n, s) => n + hanCount(s.zh), 0),
      });
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
    const rows = scenarios.map((s, i) => ({
      id: s.id,
      hsk_level: s.level,
      position: i + 1,
      title: s.title,
      emoji: s.emoji,
      setting: s.setting,
      ai_role: s.ai_role,
      learner_role: s.learner_role,
      voice: s.voice,
      goals: s.goals,
      opening: s.opening,
      phrases: s.phrases,
      readings: readingsFor([...scenarioTexts(s), ...s.words], lex, t2s),
    }));
    const { error } = await db.from('tutor_scenarios').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`tutor_scenarios: ${error.message}`);
    console.log(`✔ tutor scenarios: ${rows.length}`);
  }
}
