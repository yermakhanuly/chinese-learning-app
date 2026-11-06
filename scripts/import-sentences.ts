/**
 * Example sentences (Tatoeba, CC BY 2.0 FR) and word topics, called from import-vocab.ts.
 * Sentences are split into words with pinyin, rated by their hardest word, and the best three
 * are linked to each HSK word.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  buildLexicon,
  buildTradToSimp,
  difficulty,
  hanCount,
  pickExamples,
  tokenize,
  type Candidate,
  type Token,
} from '../src/lib/sentences.ts';
import type { DictionaryRow, WordRow } from '../src/lib/vocab-parsers.ts';

const TATOEBA = 'https://downloads.tatoeba.org/exports/per_language';
const FILES = {
  cmn: { url: `${TATOEBA}/cmn/cmn_sentences.tsv.bz2`, name: 'cmn_sentences.tsv' },
  eng: { url: `${TATOEBA}/eng/eng_sentences.tsv.bz2`, name: 'eng_sentences.tsv' },
  links: { url: `${TATOEBA}/cmn/cmn-eng_links.tsv.bz2`, name: 'cmn-eng_links.tsv' },
};
const BATCH = 1000;
const EXAMPLES_PER_WORD = 3;

async function ensureTatoeba(raw: string) {
  for (const f of Object.values(FILES)) {
    const path = join(raw, f.name);
    if (existsSync(path)) continue;
    console.log(`Downloading ${f.name}…`);
    const res = await fetch(f.url);
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${f.url}`);
    const compressed = Buffer.from(await res.arrayBuffer());
    writeFileSync(path, execFileSync('bzip2', ['-dc'], { input: compressed, maxBuffer: 1024 * 1024 * 1024 }));
  }
}

function tsvRows(path: string): string[][] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'));
}

type SentenceRow = {
  id: number;
  simplified: string;
  traditional: string;
  english: string;
  english_id: number;
  tokens: Token[];
  difficulty: number;
};

export function buildExamples(raw: string, words: WordRow[], cedict: DictionaryRow[]) {
  const lex = buildLexicon(
    words.map((w) => ({ simplified: w.simplified, traditional: w.traditional, pinyin: w.pinyin, level: w.hsk_level })),
    cedict,
  );
  const t2s = buildTradToSimp(cedict);

  const links = new Map<number, number[]>();
  for (const [a, b] of tsvRows(join(raw, FILES.links.name))) {
    const list = links.get(Number(a)) ?? [];
    list.push(Number(b));
    links.set(Number(a), list);
  }
  const wanted = new Set([...links.values()].flat());
  const english = new Map<number, string>();
  for (const line of readFileSync(join(raw, FILES.eng.name), 'utf8').split('\n')) {
    const tab = line.indexOf('\t');
    const id = Number(line.slice(0, tab));
    if (wanted.has(id)) english.set(id, line.slice(line.lastIndexOf('\t') + 1));
  }

  // Tatoeba has many sentences in both scripts; keep one per simplified text, preferring the
  // simplified original (its traditional form then comes from the dictionary).
  const bySimplified = new Map<string, SentenceRow & { fromTraditional: boolean }>();
  for (const [idText, , text] of tsvRows(join(raw, FILES.cmn.name))) {
    const id = Number(idText);
    const englishId = (links.get(id) ?? []).find((e) => english.has(e));
    if (englishId === undefined || !text) continue;
    const tokens = tokenize(text.trim(), lex, t2s);
    if (!tokens) continue;
    const simplified = tokens.map((t) => t.s).join('');
    const fromTraditional = simplified !== text.trim();
    const existing = bySimplified.get(simplified);
    if (existing && !(existing.fromTraditional && !fromTraditional)) continue;
    bySimplified.set(simplified, {
      id,
      simplified,
      traditional: tokens.map((t) => t.t).join(''),
      english: english.get(englishId)!,
      english_id: englishId,
      tokens,
      difficulty: difficulty(tokens, lex),
      fromTraditional,
    });
  }

  const candidates = new Map<string, Candidate[]>();
  for (const s of bySimplified.values()) {
    const candidate: Candidate = {
      id: s.id,
      simplified: s.simplified,
      english: s.english,
      difficulty: s.difficulty,
      length: hanCount(s.simplified),
    };
    for (const w of new Set(s.tokens.filter((t) => t.p).map((t) => t.s))) {
      if (lex.entries.get(w)?.level == null) continue;
      const list = candidates.get(w) ?? [];
      list.push(candidate);
      candidates.set(w, list);
    }
  }

  const wordLinks: { word: string; sentence_id: number; position: number }[] = [];
  const used = new Map<number, SentenceRow>();
  for (const w of words) {
    if (w.hsk_level == null) continue;
    pickExamples(candidates.get(w.simplified) ?? [], w.hsk_level, EXAMPLES_PER_WORD).forEach((c, i) => {
      const { fromTraditional: _, ...row } = bySimplified.get(c.simplified)!;
      used.set(c.id, row);
      wordLinks.push({ word: w.simplified, sentence_id: c.id, position: i + 1 });
    });
  }
  return { sentences: [...used.values()], links: wordLinks };
}

async function allWordIds(db: SupabaseClient): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await db
      .from('words')
      .select('id, simplified')
      .order('id')
      .range(from, from + BATCH - 1);
    if (error) throw new Error(`reading word ids: ${error.message}`);
    for (const r of data) ids.set(r.simplified, r.id);
    if (data.length < BATCH) return ids;
  }
}

async function insertAll(db: SupabaseClient, table: string, rows: object[]) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from(table).insert(rows.slice(i, i + BATCH));
    if (error) throw new Error(`${table} batch ${i}: ${error.message}`);
  }
}

export async function importSentencesAndTopics(
  db: SupabaseClient,
  root: string,
  words: WordRow[],
  cedict: DictionaryRow[],
) {
  const raw = join(root, 'data', 'raw');
  await ensureTatoeba(raw);
  const { sentences, links } = buildExamples(raw, words, cedict);
  const ids = await allWordIds(db);

  // Replace everything: links first (they reference sentences).
  for (const [table, column] of [
    ['word_sentences', 'word_id'],
    ['sentences', 'id'],
  ]) {
    const { error } = await db.from(table).delete().gte(column, 0);
    if (error) throw new Error(`clearing ${table}: ${error.message}`);
  }
  await insertAll(db, 'sentences', sentences);
  await insertAll(
    db,
    'word_sentences',
    links.map((l) => ({ word_id: ids.get(l.word)!, sentence_id: l.sentence_id, position: l.position })),
  );
  const covered = new Set(links.map((l) => l.word)).size;
  console.log(`✔ example sentences: ${sentences.length} (for ${covered} HSK words)`);

  // Topics come from data/word-topics.json (made by `npm run data:topics`, committed to the repo).
  const topicsFile = join(root, 'data', 'word-topics.json');
  if (!existsSync(topicsFile)) {
    console.log('  (no data/word-topics.json yet — skipping topics)');
    return;
  }
  const topics: Record<string, string[]> = JSON.parse(readFileSync(topicsFile, 'utf8'));
  const { error } = await db.from('word_topics').delete().gte('word_id', 0);
  if (error) throw new Error(`clearing word_topics: ${error.message}`);
  const rows = Object.entries(topics).flatMap(([word, slugs]) =>
    ids.has(word) ? slugs.map((topic_slug) => ({ word_id: ids.get(word)!, topic_slug })) : [],
  );
  await insertAll(db, 'word_topics', rows);
  console.log(`✔ word topics: ${rows.length}`);
}

/**
 * Recomputes pinyin, simplified and traditional text of the sentences already in the database from
 * the Tatoeba originals, and updates only the rows that changed. Rows keep their ids, so learners'
 * sentence review cards are kept (a full re-import deletes and re-inserts sentences).
 *
 *   npm run data:import -- --only=sentence-tokens
 */
export async function retokenizeSentences(db: SupabaseClient, root: string, words: WordRow[], cedict: DictionaryRow[]) {
  const raw = join(root, 'data', 'raw');
  await ensureTatoeba(raw);
  const lex = buildLexicon(
    words.map((w) => ({ simplified: w.simplified, traditional: w.traditional, pinyin: w.pinyin, level: w.hsk_level })),
    cedict,
  );
  const t2s = buildTradToSimp(cedict);
  const original = new Map<number, string>();
  for (const [idText, , text] of tsvRows(join(raw, FILES.cmn.name))) original.set(Number(idText), text.trim());

  let changed = 0;
  let failed = 0;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('sentences').select('id, simplified, tokens').order('id').range(from, from + 999);
    if (error) throw new Error(`reading sentences: ${error.message}`);
    for (const row of data as { id: number; simplified: string; tokens: Token[] }[]) {
      const text = original.get(row.id);
      const tokens = text ? tokenize(text, lex, t2s) : null;
      const same = (a: Token[], b: Token[]) => a.length === b.length && a.every((t, i) => t.s === b[i].s && t.t === b[i].t && t.p === b[i].p);
      if (!tokens || same(tokens, row.tokens)) continue;
      const { error: updateError } = await db
        .from('sentences')
        .update({
          simplified: tokens.map((t) => t.s).join(''),
          traditional: tokens.map((t) => t.t).join(''),
          tokens,
          difficulty: difficulty(tokens, lex),
        })
        .eq('id', row.id);
      if (updateError) {
        failed++;
        console.warn(`  sentence ${row.id}: ${updateError.message}`);
      } else changed++;
    }
    if (data.length < 1000) break;
  }
  console.log(`✔ sentence pinyin: ${changed} sentences updated${failed ? `, ${failed} failed` : ''}`);
}
