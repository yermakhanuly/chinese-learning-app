/**
 * Neural audio for words, sentences and tone-trainer syllables (Azure Speech, voices Xiaoxiao and
 * Yunxi), stored as MP3 in the Supabase "audio" bucket at clips/<audioKey(text)>.mp3, plus each
 * clip's pitch curve in `audio_clips` and a list of keys in audio/index.json for the app.
 *
 *   npm run audio:generate                 # generate missing clips (cached in data/audio/), upload to LOCAL
 *   npm run audio:generate -- --limit=20   # try it: 20 clips of each kind
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run audio:generate -- --upload-only   # cloud, no Azure calls
 *
 * Needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in scripts/.env. The free tier allows 20 voice
 * requests a minute, so many texts go into one request, separated by long pauses, and the audio is
 * cut at the pauses.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Mp3Encoder } from '@breezystack/lamejs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { TONE_PAIRS, TONE_SYLLABLES } from '../src/constants/tones.ts';
import { audioKey, syllableText } from '../src/lib/audio-key.ts';
import { decodeWav, pitchCurve, resample, trackPitch } from '../src/lib/pitch.ts';
import { credentials } from './supabase-credentials.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'data', 'audio');
const META = join(CACHE, 'clips.json');
const MAX_LEVEL = 4;
const RATE = 24000;
const FEMALE = 'zh-CN-XiaoxiaoNeural';
const MALE = 'zh-CN-YunxiNeural';
const PAUSE_MS = 1200;
const MIN_GAP_S = 0.6;

type Kind = 'word' | 'sentence' | 'syllable';
type Item = { key: string; text: string; kind: Kind; voice: string; ssml: string; hsk_level: number | null };
type Meta = { text: string; kind: Kind; voice: string; duration_ms: number; pitch: (number | null)[][]; hsk_level: number | null };

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Everything that should have audio. */
async function collectItems(db: SupabaseClient): Promise<Item[]> {
  const items = new Map<string, Item>();
  const add = (text: string, kind: Kind, hsk_level: number | null, ssml = escapeXml(text)) => {
    const key = audioKey(text);
    if (items.has(key) || !text.trim()) return;
    // Words in the female voice; sentences alternate (by key) so both voices are heard.
    const voice = kind === 'sentence' && parseInt(key[15], 16) % 2 ? MALE : FEMALE;
    items.set(key, { key, text, kind, voice, ssml, hsk_level });
  };

  const words = new Map<string, number | null>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('words').select('id, simplified, hsk_level').lte('hsk_level', MAX_LEVEL).range(from, from + 999);
    if (error) throw error;
    for (const w of data) words.set(w.simplified, w.hsk_level);
    if (data.length < 1000) break;
  }
  const allWords = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('words').select('simplified').range(from, from + 999);
    if (error) throw error;
    for (const w of data) allWords.add(w.simplified);
    if (data.length < 1000) break;
  }
  for (const [w, level] of words) add(w, 'word', level);

  // Example sentences of those words.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .rpc('audio_sentence_texts', { p_max_level: MAX_LEVEL })
      .order('simplified')
      .range(from, from + 999);
    if (error) throw error;
    for (const s of data as { simplified: string; hsk_level: number }[]) add(s.simplified, 'sentence', s.hsk_level);
    if (data.length < 1000) break;
  }

  // Every Chinese text in the lessons, and the examples on their word cards.
  const { data: lessons, error: lessonError } = await db.from('lessons').select('readings, word_details, units(hsk_level)');
  if (lessonError) throw lessonError;
  for (const l of lessons as unknown as { readings: Record<string, unknown>; word_details: Record<string, { example: { simplified: string } | null }>; units: { hsk_level: number } }[]) {
    const level = l.units.hsk_level;
    for (const text of Object.keys(l.readings)) add(text, allWords.has(text) ? 'word' : 'sentence', level);
    for (const d of Object.values(l.word_details)) if (d.example) add(d.example.simplified, 'sentence', level);
  }

  for (const p of TONE_PAIRS) for (const w of p.words) add(w, 'word', words.get(w) ?? null);
  for (const s of TONE_SYLLABLES) {
    s.chars.forEach((ch, i) => {
      const tone = i + 1;
      add(syllableText(s.syllable, tone), 'syllable', null, `<phoneme alphabet="sapi" ph="${s.syllable} ${tone}">${ch}</phoneme>`);
    });
  }
  return [...items.values()];
}

// ---------------------------------------------------------------------------
// Azure

let lastRequest = 0;
async function synthesize(voice: string, body: string): Promise<Float32Array> {
  const { AZURE_SPEECH_KEY: key, AZURE_SPEECH_REGION: region } = process.env;
  if (!key || !region) throw new Error('Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in scripts/.env');
  for (let attempt = 1; ; attempt++) {
    // Free tier: 20 requests per minute.
    const wait = lastRequest + 3200 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
        'User-Agent': 'hsk-chinese-audio',
      },
      body: `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN"><voice name="${voice}">${body}</voice></speak>`,
    });
    if (res.ok) return decodeWav(new Uint8Array(await res.arrayBuffer())).samples;
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await new Promise((r) => setTimeout(r, 15000 * attempt));
      continue;
    }
    throw new Error(`Azure TTS ${res.status}: ${await res.text()}`);
  }
}

/** Speech segments separated by pauses of at least MIN_GAP_S (10 ms frames, near-silence threshold). */
function splitOnPauses(samples: Float32Array): Float32Array[] {
  const frame = RATE / 100;
  const loud: boolean[] = [];
  for (let i = 0; i < samples.length; i += frame) {
    let e = 0;
    for (let j = i; j < Math.min(samples.length, i + frame); j++) e += samples[j] ** 2;
    loud.push(Math.sqrt(e / frame) > 0.003);
  }
  const segments: [number, number][] = [];
  let start = -1;
  let quiet = 0;
  loud.forEach((l, i) => {
    if (l) {
      if (start < 0) start = i;
      quiet = 0;
    } else if (start >= 0 && ++quiet >= MIN_GAP_S * 100) {
      segments.push([start, i - quiet + 1]);
      start = -1;
      quiet = 0;
    }
  });
  if (start >= 0) segments.push([start, loud.length - quiet]);
  const pad = 5; // 50 ms
  return segments.map(([a, b]) => samples.slice(Math.max(0, (a - pad) * frame), Math.min(samples.length, (b + pad) * frame)));
}

/** Synthesizes several texts in one request; splits in halves if the pauses don't line up. */
async function synthesizeBatch(items: Item[]): Promise<Float32Array[]> {
  const body = items.map((i) => i.ssml).join(`<break time="${PAUSE_MS}ms"/>`);
  const audio = await synthesize(items[0].voice, body);
  if (items.length === 1) {
    const parts = splitOnPauses(audio);
    return [parts.length ? concat(parts) : audio];
  }
  const parts = splitOnPauses(audio);
  if (parts.length === items.length) return parts;
  const half = Math.ceil(items.length / 2);
  return [...(await synthesizeBatch(items.slice(0, half))), ...(await synthesizeBatch(items.slice(half)))];
}

function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function toMp3(samples: Float32Array): Buffer {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
  const enc = new Mp3Encoder(1, RATE, 48);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += 1152) chunks.push(enc.encodeBuffer(pcm.subarray(i, i + 1152)));
  chunks.push(enc.flush());
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

/** The model pitch curve, 40 points, for drawing under the learner's. */
function modelPitch(samples: Float32Array): (number | null)[][] {
  const { points } = pitchCurve(trackPitch(resample(samples, RATE, 16000), 16000));
  if (!points.length) return [];
  return Array.from({ length: 40 }, (_, i) => {
    const t = i / 39;
    const p = points.reduce((best, q) => (Math.abs(q.t - t) < Math.abs(best.t - t) ? q : best));
    return [Math.round(t * 100) / 100, p.v == null ? null : Math.round(p.v * 100) / 100];
  });
}

async function generate(items: Item[], meta: Record<string, Meta>) {
  const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? Infinity);
  // A sample of every kind first when trying it out with --limit.
  const missing = items.filter((i) => !meta[i.key] || !existsSync(join(CACHE, `${i.key}.mp3`)));
  const todo = Number.isFinite(limit)
    ? (['word', 'sentence', 'syllable'] as Kind[]).flatMap((k) => missing.filter((i) => i.kind === k).slice(0, limit))
    : missing;
  const count = (k: Kind) => items.filter((i) => i.kind === k).length;
  console.log(`${items.length} texts: ${count('word')} words, ${count('sentence')} sentences, ${count('syllable')} syllables.`);
  console.log(`Generating ${todo.length} clips (${items.length - missing.length} already cached)…`);
  const groups = new Map<string, Item[]>();
  for (const i of todo) groups.set(`${i.voice}|${i.kind}`, [...(groups.get(`${i.voice}|${i.kind}`) ?? []), i]);
  let done = 0;
  for (const [group, list] of groups) {
    const size = group.endsWith('sentence') ? 12 : 30;
    for (let b = 0; b < list.length; b += size) {
      const batch = list.slice(b, b + size);
      const clips = await synthesizeBatch(batch);
      batch.forEach((item, k) => {
        writeFileSync(join(CACHE, `${item.key}.mp3`), toMp3(clips[k]));
        meta[item.key] = {
          text: item.text,
          kind: item.kind,
          voice: item.voice,
          duration_ms: Math.round((clips[k].length / RATE) * 1000),
          pitch: modelPitch(clips[k]),
          hsk_level: item.hsk_level,
        };
      });
      writeFileSync(META, JSON.stringify(meta));
      done += batch.length;
      process.stdout.write(`\r  ${done}/${todo.length}`);
    }
  }
  if (todo.length) process.stdout.write('\n');
}

async function upload(db: SupabaseClient, meta: Record<string, Meta>) {
  const existing = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('audio_clips').select('key').range(from, from + 999);
    if (error) throw error;
    for (const r of data) existing.add(r.key);
    if (data.length < 1000) break;
  }
  const keys = Object.keys(meta).filter((k) => !existing.has(k) && existsSync(join(CACHE, `${k}.mp3`)));
  console.log(`Uploading ${keys.length} clips (${existing.size} already uploaded)…`);
  const bucket = db.storage.from('audio');
  let n = 0;
  const queue = [...keys];
  const worker = async () => {
    for (let key = queue.shift(); key; key = queue.shift()) {
      const { error } = await bucket.upload(`clips/${key}.mp3`, readFileSync(join(CACHE, `${key}.mp3`)), {
        contentType: 'audio/mpeg',
        cacheControl: '31536000',
        upsert: true,
      });
      if (error) throw new Error(`upload ${key}: ${error.message}`);
      const { error: rowError } = await db.from('audio_clips').upsert({ key, ...meta[key] });
      if (rowError) throw new Error(`audio_clips ${key}: ${rowError.message}`);
      if (++n % 100 === 0) process.stdout.write(`\r  ${n}/${keys.length}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  if (keys.length) process.stdout.write(`\r  ${n}/${keys.length}\n`);

  const all = [...existing, ...keys].sort();
  const { error } = await bucket.upload('index.json', JSON.stringify(all), {
    contentType: 'application/json',
    cacheControl: '300',
    upsert: true,
  });
  if (error) throw new Error(`index.json: ${error.message}`);
  console.log(`✔ audio: ${all.length} clips`);
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  const { url, key } = credentials(ROOT);
  const db = createClient(url, key, { auth: { persistSession: false } });
  const meta: Record<string, Meta> = existsSync(META) ? JSON.parse(readFileSync(META, 'utf8')) : {};
  if (!process.argv.includes('--upload-only')) await generate(await collectItems(db), meta);
  await upload(db, meta);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
