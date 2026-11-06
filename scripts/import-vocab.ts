/**
 * Loads HSK vocabulary, CC-CEDICT, Tatoeba example sentences, word topics and the course
 * (content/) into Supabase.
 *
 *   npm run data:import            # local Supabase (credentials read from `supabase status`)
 *   npm run data:import -- --only=characters   # only the characters step
 *
 * For a cloud project set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.
 * Safe to re-run: words are upserted, dictionary entries are replaced.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { createClient } from '@supabase/supabase-js';

import { parseCedictLine, parseHskEntry, type HskSourceEntry } from '../src/lib/vocab-parsers.ts';
import { importCharacters } from './import-characters.ts';
import { credentials } from './supabase-credentials.ts';
import { importLessons } from './import-lessons.ts';
import { importSentencesAndTopics } from './import-sentences.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const HSK_FILE = join(RAW, 'complete-hsk.json');
const CEDICT_FILE = join(RAW, 'cedict.txt');
const HSK_URL = 'https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.json';
const CEDICT_URL = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz';
const BATCH = 1000;

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function ensureSources() {
  mkdirSync(RAW, { recursive: true });
  if (!existsSync(HSK_FILE)) {
    console.log('Downloading HSK vocabulary…');
    writeFileSync(HSK_FILE, await download(HSK_URL));
  }
  if (!existsSync(CEDICT_FILE)) {
    console.log('Downloading CC-CEDICT…');
    writeFileSync(CEDICT_FILE, gunzipSync(await download(CEDICT_URL)));
  }
}

async function main() {
  await ensureSources();
  const { url, key } = credentials(ROOT);
  const db = createClient(url, key, { auth: { persistSession: false } });

  // HSK words
  const hskRaw: HskSourceEntry[] = JSON.parse(readFileSync(HSK_FILE, 'utf8'));
  if (!Array.isArray(hskRaw)) throw new Error('Unexpected HSK file format');
  const words = hskRaw.map(parseHskEntry);
  const unique = [...new Map(words.map((w) => [w.simplified, w])).values()];

  const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
  if (only === 'characters') return importCharacters(db, RAW, unique);
  if (only) throw new Error(`Unknown step: ${only}`);
  for (let i = 0; i < unique.length; i += BATCH) {
    const { error } = await db
      .from('words')
      .upsert(
        unique.slice(i, i + BATCH).map((w) => ({ ...w, updated_at: new Date().toISOString() })),
        { onConflict: 'simplified' },
      );
    if (error) throw new Error(`words batch ${i}: ${error.message}`);
  }
  console.log(`✔ words: ${unique.length}`);

  // CC-CEDICT
  const entries = readFileSync(CEDICT_FILE, 'utf8')
    .split('\n')
    .map(parseCedictLine)
    .filter((e) => e !== null);
  const { error: delError } = await db.from('dictionary_entries').delete().gte('id', 0);
  if (delError) throw new Error(`clearing dictionary: ${delError.message}`);
  for (let i = 0; i < entries.length; i += BATCH) {
    const { error } = await db.from('dictionary_entries').insert(entries.slice(i, i + BATCH));
    if (error) throw new Error(`dictionary batch ${i}: ${error.message}`);
  }
  console.log(`✔ dictionary entries: ${entries.length}`);

  await importCharacters(db, RAW, unique);
  await importSentencesAndTopics(db, ROOT, unique, entries);
  await importLessons(db, ROOT, unique, entries);

  // Summary per 2026 HSK level
  for (let level = 1; level <= 7; level++) {
    const { count } = await db.from('words').select('*', { count: 'exact', head: true }).eq('hsk_level', level);
    console.log(`  HSK ${level === 7 ? '7–9' : level}: ${count} words`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
