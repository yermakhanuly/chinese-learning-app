/**
 * Admin dashboard actions that need the server (admins only). POST JSON { action, … }:
 *   check   { draft_id }                       → { problems, row }     checks a draft, builds its row
 *   publish { draft_id, accept_problems? }     → { problems, row }     writes the row to the live table
 *   audio   { texts: string[], voice?, replace? } → { made, skipped }  natural-voice clips for texts
 *   upload_audio { text, mp3: base64 }         → { key }               replaces one clip with a recording
 *
 * Publishing adds what authors don't write (pinyin + traditional, word details) with the same code
 * as the import script (src/lib/content-rows.ts), using a small lexicon for just these texts.
 * Published rows get edited_at, so `npm run data:import` keeps them.
 *
 * Secrets: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (audio only).
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { audioKey } from '../../../src/lib/audio-key.ts';
import {
  candidateWords,
  draftTexts,
  grammarRow,
  lessonRow,
  pinyinTexts,
  readingRow,
  scenarioRow,
  type EditKind,
  type ExampleRow,
  type GrammarDraft,
  type LessonDraft,
  type ReadingDraft,
  type ScenarioDraft,
  type UnitDraft,
  type WordDraft,
  type WordInfoRow,
} from '../../../src/lib/content-rows.ts';
import { checkGrammarPoint, checkReading } from '../../../src/lib/grammar.ts';
import { checkLesson } from '../../../src/lib/lessons.ts';
import { buildLexicon, hanCount, type Lexicon } from '../../../src/lib/sentences.ts';
import { checkScenario } from '../../../src/lib/tutor.ts';
import { logFunctionError } from '../_shared/log.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const TABLE: Record<EditKind, string> = {
  unit: 'units',
  lesson: 'lessons',
  word: 'words',
  grammar: 'grammar_points',
  reading: 'reading_texts',
  scenario: 'tutor_scenarios',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  let userId: string | null = null;
  try {
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const user = jwt ? (await db.auth.getUser(jwt)).data.user : null;
    if (!user) throw new HttpError(401, 'Log in first.');
    userId = user.id;
    const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (!profile?.is_admin) throw new HttpError(403, 'Admins only.');
    const body = await req.json().catch(() => {
      throw new HttpError(400, 'Expected JSON.');
    });
    switch (body.action) {
      case 'check':
        return json(await check(db, body.draft_id));
      case 'publish':
        return json(await publish(db, body.draft_id, body.accept_problems === true));
      case 'audio':
        return json(await makeAudio(db, body.texts, body.voice === 'male' ? 'male' : 'female', body.replace === true));
      case 'upload_audio':
        return json(await uploadAudio(db, body.text, body.mp3));
      default:
        throw new HttpError(400, 'Unknown action.');
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    await logFunctionError(db, 'admin', e, userId);
    return json({ error: e instanceof Error ? e.message : 'Something went wrong.' }, 500);
  }
});

// --- Checking and building rows -------------------------------------------------------------------

type Draft = { id: string; kind: EditKind; ref_id: string; is_new: boolean; data: Record<string, unknown>; status: string };

async function loadDraft(db: SupabaseClient, id: unknown): Promise<Draft> {
  if (typeof id !== 'string') throw new HttpError(400, 'Missing draft.');
  const { data, error } = await db.from('content_drafts').select('id, kind, ref_id, is_new, data, status').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'Draft not found.');
  if (data.status !== 'draft') throw new HttpError(409, 'This draft was already published or discarded.');
  return data as Draft;
}

type MiniLexicon = { lex: Lexicon; upTo: (level: number) => Set<string>; words: Map<string, WordInfoRow>; meanings: Map<string, string[]> };

/** Lexicon entries for every substring of the texts (the same splitting as with the full dictionary). */
async function lexiconFor(db: SupabaseClient, texts: string[]): Promise<MiniLexicon> {
  const candidates = candidateWords(texts);
  type Entry = { source: 'hsk' | 'cedict'; simplified: string; traditional: string; pinyin: string; pinyin_numeric: string; hsk_level: number | null; meanings: string[]; classifiers: string[] };
  const rows: Entry[] = [];
  for (let i = 0; i < candidates.length; i += 2000) {
    const { data, error } = await db.rpc('lexicon_entries', { p_words: candidates.slice(i, i + 2000) });
    if (error) throw error;
    rows.push(...(data as Entry[]));
  }
  const hsk = rows.filter((r) => r.source === 'hsk');
  const cedict = rows.filter((r) => r.source === 'cedict');
  const lex = buildLexicon(
    hsk.map((w) => ({ simplified: w.simplified, traditional: w.traditional, pinyin: w.pinyin, level: w.hsk_level })),
    cedict.map((e) => ({ simplified: e.simplified, traditional: e.traditional, pinyin_numeric: e.pinyin_numeric })),
  );
  // Same gloss order as the import: CC-CEDICT's first entry, then the HSK meanings win.
  const meanings = new Map<string, string[]>();
  for (const e of cedict) if (!meanings.has(e.simplified)) meanings.set(e.simplified, e.meanings.slice(0, 3));
  for (const w of hsk) meanings.set(w.simplified, w.meanings.slice(0, 3));
  return {
    lex,
    upTo: (level) => new Set(hsk.filter((w) => w.hsk_level !== null && w.hsk_level <= level).map((w) => w.simplified)),
    words: new Map(hsk.map((w) => [w.simplified, { traditional: w.traditional, pinyin: w.pinyin, meanings: w.meanings, classifiers: w.classifiers }])),
    meanings,
  };
}

const NO_T2S = new Map<string, string>(); // authored text is simplified

const need = (cond: unknown, what: string) => {
  if (!cond) throw new HttpError(422, `The draft is missing ${what}.`);
};

async function build(db: SupabaseClient, d: Draft): Promise<{ problems: string[]; row: Record<string, unknown> }> {
  const data = d.data;
  if ((d.kind === 'word' ? data.simplified : data.id) !== d.ref_id) throw new HttpError(422, 'The id in the draft does not match the item.');
  try {
    switch (d.kind) {
      case 'unit': {
        const u = data as unknown as UnitDraft;
        const problems = ['title', 'title_zh', 'theme', 'description'].filter((k) => !String((u as Record<string, unknown>)[k] ?? '').trim()).map((k) => `${k} is required`);
        if (!/^hsk\d-u\d{2}$/.test(u.id)) problems.push('id should look like hsk1-u01');
        return { problems, row: { id: u.id, hsk_level: u.hsk_level, position: u.position, title: u.title, title_zh: u.title_zh, theme: u.theme, description: u.description } };
      }
      case 'word': {
        const w = data as unknown as WordDraft;
        need(Array.isArray(w.meanings) && Array.isArray(w.classifiers), 'meanings or classifiers');
        const problems = w.meanings.filter((m) => !m.trim()).length || !w.meanings.length ? ['every word needs at least one meaning (no empty ones)'] : [];
        return { problems, row: { simplified: w.simplified, meanings: w.meanings.map((m) => m.trim()), classifiers: w.classifiers } };
      }
      case 'lesson': {
        const l = data as unknown as LessonDraft;
        need(Array.isArray(l.steps) && Array.isArray(l.words), 'steps or words');
        const { data: unit } = await db.from('units').select('hsk_level').eq('id', l.unit_id).maybeSingle();
        if (!unit) throw new HttpError(422, `Unit ${l.unit_id} does not exist.`);
        const m = await lexiconFor(db, draftTexts('lesson', l));
        const problems = checkLesson(l, m.upTo(unit.hsk_level), m.lex);
        // Example sentence for each new word: the first one linked in the dictionary.
        const examples = new Map<string, ExampleRow>();
        if (l.words.length) {
          const { data: ex, error } = await db
            .from('words')
            .select('simplified, word_sentences(position, sentences(simplified, traditional, english, tokens))')
            .in('simplified', l.words);
          if (error) throw error;
          for (const row of ex as unknown as { simplified: string; word_sentences: { position: number; sentences: ExampleRow }[] }[]) {
            const first = [...row.word_sentences].sort((a, b) => a.position - b.position)[0];
            if (first) examples.set(row.simplified, first.sentences);
          }
        }
        for (const w of l.words) if (!m.words.has(w)) problems.push(`new word ${w} is not an HSK word`);
        return { problems, row: lessonRow(l, l.unit_id, l.position, m.lex, NO_T2S, m.words, examples, new Map()) };
      }
      case 'grammar': {
        const g = data as unknown as GrammarDraft;
        need(Array.isArray(g.exercises) && Array.isArray(g.examples), 'exercises or examples');
        const { data: ids, error } = await db.from('grammar_points').select('id');
        if (error) throw error;
        const all = new Set([...(ids as { id: string }[]).map((r) => r.id), g.id]);
        const texts = draftTexts('grammar', g);
        const m = await lexiconFor(db, texts);
        const chars = [...new Set(texts.flatMap((t) => [...t]).filter((c) => hanCount(c) > 0))];
        const { data: knownChars, error: charError } = await db.rpc('known_characters', { p_chars: chars, p_level: g.level });
        if (charError) throw charError;
        return { problems: checkGrammarPoint(g, m.upTo(g.level), m.lex, all, new Set(knownChars as string[])), row: grammarRow(g, g.position, all, g.lessons ?? [], m.lex, NO_T2S) };
      }
      case 'reading': {
        const r = data as unknown as ReadingDraft;
        need(Array.isArray(r.sentences) && Array.isArray(r.questions), 'sentences or questions');
        const m = await lexiconFor(db, draftTexts('reading', r));
        return { problems: checkReading(r, m.upTo(r.level), m.lex), row: readingRow(r, r.position, r.grammar ?? [], m.lex, NO_T2S, m.meanings) };
      }
      case 'scenario': {
        const s = data as unknown as ScenarioDraft;
        need(Array.isArray(s.phrases) && s.opening, 'phrases or the opening line');
        const m = await lexiconFor(db, draftTexts('scenario', s));
        return { problems: checkScenario(s, m.upTo(s.level), m.lex), row: scenarioRow(s, s.position, m.lex, NO_T2S) };
      }
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e instanceof TypeError) throw new HttpError(422, `The draft is not in the expected format (${e.message}).`);
    throw e;
  }
}

/** Texts whose pinyin couldn't be worked out (a character the dictionary doesn't know). */
function missingReadings(kind: EditKind, data: Record<string, unknown>, row: Record<string, unknown>): string[] {
  const readings = row.readings as Record<string, unknown> | undefined;
  if (!readings) return [];
  return pinyinTexts(kind, data)
    .filter((t) => hanCount(t) > 0 && !readings[t])
    .filter((t, i, a) => a.indexOf(t) === i)
    .map((t) => `no pinyin for "${t}" (unknown character or Latin letters)`);
}

async function check(db: SupabaseClient, draftId: unknown) {
  const d = await loadDraft(db, draftId);
  const { problems, row } = await build(db, d);
  const all = [...problems, ...missingReadings(d.kind, d.data, row)];
  await db.from('content_drafts').update({ problems: all, checked_at: new Date().toISOString() }).eq('id', d.id);
  return { problems: all, row };
}

async function publish(db: SupabaseClient, draftId: unknown, acceptProblems: boolean) {
  const d = await loadDraft(db, draftId);
  const { problems: found, row } = await build(db, d);
  const problems = [...found, ...missingReadings(d.kind, d.data, row)];
  if (problems.length && !acceptProblems) {
    await db.from('content_drafts').update({ problems, checked_at: new Date().toISOString() }).eq('id', d.id);
    return { published: false, problems, row };
  }
  const table = TABLE[d.kind];
  const key = d.kind === 'word' ? 'simplified' : 'id';
  const now = new Date().toISOString();
  if (d.kind === 'word') {
    const { error, count } = await db.from(table).update({ ...row, edited_at: now, updated_at: now }, { count: 'exact' }).eq(key, d.ref_id);
    if (error) throw error;
    if (!count) throw new HttpError(404, 'That word is not in the dictionary.');
  } else {
    if (!d.is_new) {
      const { data: live } = await db.from(table).select(key).eq(key, d.ref_id).maybeSingle();
      if (!live) throw new HttpError(404, 'The item no longer exists.');
    }
    const { error } = await db.from(table).upsert({ ...row, edited_at: now }, { onConflict: key });
    if (error) throw new HttpError(422, `Couldn't save: ${error.message}`);
  }
  await db.from('content_drafts').update({ status: 'published', problems, published_at: now, checked_at: now }).eq('id', d.id);
  return { published: true, problems, row };
}

// --- Audio ----------------------------------------------------------------------------------------

const VOICES = { female: 'zh-CN-XiaoxiaoNeural', male: 'zh-CN-YunxiNeural' } as const;
const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Adds keys to audio/index.json (the list of texts that have a clip, read by the app). */
async function addToIndex(db: SupabaseClient, keys: string[]) {
  const bucket = db.storage.from('audio');
  const { data: file } = await bucket.download('index.json');
  const index = new Set<string>(file ? JSON.parse(await file.text()) : []);
  const before = index.size;
  for (const k of keys) index.add(k);
  if (index.size === before) return;
  const { error } = await bucket.upload('index.json', new Blob([JSON.stringify([...index])], { type: 'application/json' }), {
    upsert: true,
    contentType: 'application/json',
    cacheControl: '60',
  });
  if (error) throw error;
}

async function saveClip(db: SupabaseClient, text: string, mp3: Uint8Array, voice: string) {
  const key = audioKey(text);
  const { error } = await db.storage.from('audio').upload(`clips/${key}.mp3`, mp3, { upsert: true, contentType: 'audio/mpeg', cacheControl: '3600' });
  if (error) throw error;
  const kind = hanCount(text) <= 4 ? 'word' : 'sentence';
  // Rough length from the bitrate (48 kbit/s); the pitch curve is only made by the generation script.
  const { error: rowError } = await db
    .from('audio_clips')
    .upsert({ key, text, kind, voice, duration_ms: Math.round((mp3.length * 8) / 48), pitch: [] }, { onConflict: 'key' });
  if (rowError) throw rowError;
  return key;
}

async function makeAudio(db: SupabaseClient, texts: unknown, voice: 'female' | 'male', replace: boolean) {
  if (!Array.isArray(texts) || !texts.length || texts.length > 60) throw new HttpError(400, 'Send 1–60 texts.');
  const list = [...new Set(texts.filter((t): t is string => typeof t === 'string' && hanCount(t) > 0 && t.length <= 120))];
  const key = Deno.env.get('AZURE_SPEECH_KEY');
  const region = Deno.env.get('AZURE_SPEECH_REGION');
  if (!key || !region) throw new HttpError(503, 'Azure Speech is not set up.');
  const { data: existing } = await db.from('audio_clips').select('key').in('key', list.map(audioKey));
  const have = new Set((existing ?? []).map((r) => r.key));
  const made: string[] = [];
  const skipped: string[] = [];
  for (const text of list) {
    if (!replace && have.has(audioKey(text))) {
      skipped.push(text);
      continue;
    }
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'hsk-chinese-admin',
      },
      body: `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN"><voice name="${VOICES[voice]}">${escapeXml(text)}</voice></speak>`,
    });
    if (res.status === 429) throw new HttpError(429, `Azure is busy (made ${made.length} so far). Try again in a minute.`);
    if (!res.ok) throw new HttpError(502, `Azure couldn't make "${text}" (${res.status}).`);
    await saveClip(db, text, new Uint8Array(await res.arrayBuffer()), VOICES[voice]);
    made.push(text);
  }
  await addToIndex(db, made.map(audioKey));
  return { made, skipped };
}

async function uploadAudio(db: SupabaseClient, text: unknown, mp3: unknown) {
  if (typeof text !== 'string' || !hanCount(text) || text.length > 120) throw new HttpError(400, 'Missing text.');
  if (typeof mp3 !== 'string' || mp3.length > 1_400_000) throw new HttpError(400, 'The file is missing or larger than 1 MB.');
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(mp3), (c) => c.charCodeAt(0));
  } catch {
    throw new HttpError(400, 'Invalid file.');
  }
  // MP3: an ID3 tag or an MPEG frame header.
  const isMp3 = (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (!isMp3) throw new HttpError(400, 'Upload an MP3 file.');
  const key = await saveClip(db, text, bytes, 'upload');
  await addToIndex(db, [key]);
  return { key };
}
