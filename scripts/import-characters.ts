/**
 * Characters from Make Me a Hanzi (github.com/skishore/makemeahanzi), called from import-vocab.ts:
 * stroke shapes + medians (graphics.txt, Arphic Public License) and radical, decomposition,
 * etymology, definition, pinyin (dictionary.txt, LGPL). Only characters used by HSK words.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';

import { charactersOfWords } from '../src/lib/characters.ts';
import type { WordRow } from '../src/lib/vocab-parsers.ts';

const BASE = 'https://raw.githubusercontent.com/skishore/makemeahanzi/master';
const FILES = { graphics: 'mmah-graphics.txt', dictionary: 'mmah-dictionary.txt' };
const BATCH = 300;

type Graphics = { character: string; strokes: string[]; medians: number[][][] };
type Dict = {
  character: string;
  definition?: string;
  pinyin: string[];
  decomposition: string;
  etymology?: Record<string, string>;
  radical: string;
};

/** Downloads a file (resuming if the connection drops: graphics.txt is ~30 MB). */
async function download(url: string, path: string) {
  const res = await fetch(url, { method: 'HEAD' });
  const size = Number(res.headers.get('content-length'));
  let data = Buffer.alloc(0);
  for (let attempt = 0; attempt < 10 && (!size || data.length < size); attempt++) {
    const part = await fetch(url, { headers: data.length ? { Range: `bytes=${data.length}-` } : {} });
    if (!part.ok) throw new Error(`Download failed (${part.status}): ${url}`);
    try {
      data = Buffer.concat([data, Buffer.from(await part.arrayBuffer())]);
    } catch {
      // Connection dropped; resume from what we have.
    }
    if (!size) break;
  }
  if (size && data.length !== size) throw new Error(`Incomplete download: ${url}`);
  writeFileSync(path, data);
}

function readJsonLines<T>(path: string): T[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

export async function importCharacters(db: SupabaseClient, raw: string, words: WordRow[]) {
  for (const [key, name] of Object.entries(FILES)) {
    const path = join(raw, name);
    if (existsSync(path) && statSync(path).size > 0) continue;
    console.log(`Downloading Make Me a Hanzi ${key}…`);
    await download(`${BASE}/${key}.txt`, path);
  }
  const graphics = new Map(readJsonLines<Graphics>(join(raw, FILES.graphics)).map((g) => [g.character, g]));
  const dict = new Map(readJsonLines<Dict>(join(raw, FILES.dictionary)).map((d) => [d.character, d]));

  const used = charactersOfWords(words);
  const rows = [];
  let missing = 0;
  for (const [character, use] of used) {
    const g = graphics.get(character);
    if (!g) {
      missing++;
      continue;
    }
    const d = dict.get(character);
    rows.push({
      character,
      strokes: g.strokes,
      medians: g.medians,
      stroke_count: g.strokes.length,
      radical: d?.radical ?? null,
      decomposition: d?.decomposition && !d.decomposition.startsWith('？') ? d.decomposition : null,
      etymology: d?.etymology ?? null,
      definition: d?.definition ?? null,
      pinyin: d?.pinyin ?? [],
      hsk_level: use.level,
      traditional_only: use.traditionalOnly,
    });
  }
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from('characters').upsert(rows.slice(i, i + BATCH), { onConflict: 'character' });
    if (error) throw new Error(`characters batch ${i}: ${error.message}`);
  }
  const simplified = rows.filter((r) => !r.traditional_only).length;
  console.log(`✔ characters: ${rows.length} (${simplified} simplified, ${rows.length - simplified} traditional only; ${missing} without stroke data)`);
}
