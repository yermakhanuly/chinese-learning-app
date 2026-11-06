/**
 * Pronunciation scoring: POST JSON { text, audio } where audio is a base64 16 kHz mono WAV (≤ 30 s).
 * Signed-in learners only, with a daily limit.
 * Calls Azure Speech pronunciation assessment (zh-CN); the key never leaves the server.
 *
 * Secrets: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (supabase secrets set …; locally supabase/functions/.env).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const DAILY_LIMIT = 60;
const MAX_BYTES = 1_100_000; // ~34 s of 16 kHz 16-bit audio

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type AzurePhoneme = { Phoneme: string; Offset: number; Duration: number; AccuracyScore: number };
type AzureWord = { Word: string; ErrorType: string; AccuracyScore?: number; Offset?: number; Duration?: number; Phonemes?: AzurePhoneme[] };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Log in to check your pronunciation.' }, 401);
  let body: { text?: unknown; audio?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Expected JSON.' }, 400);
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 60 || !/\p{Script=Han}/u.test(text)) return json({ error: 'Missing or invalid text.' }, 400);
  if (typeof body.audio !== 'string' || body.audio.length > MAX_BYTES * 1.4) return json({ error: 'Recording is too long.' }, 400);
  let audio: Uint8Array;
  try {
    audio = Uint8Array.from(atob(body.audio), (c) => c.charCodeAt(0));
  } catch {
    return json({ error: 'Invalid recording.' }, 400);
  }
  if (audio.length < 3200 || audio.length > MAX_BYTES) return json({ error: 'Recording is too short or too long.' }, 400);
  const tag = (o: number) => String.fromCharCode(...audio.slice(o, o + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return json({ error: 'Expected a WAV recording.' }, 400);

  // Count against the learner's daily limit (as the learner, so the database knows who it is).
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: left, error: quotaError } = await supabase.rpc('take_pronunciation_quota', { p_limit: DAILY_LIMIT });
  if (quotaError) {
    const limit = quotaError.message.includes('limit');
    return json({ error: limit ? `You've used today's ${DAILY_LIMIT} pronunciation checks. Try again tomorrow.` : 'Log in to check your pronunciation.' }, limit ? 429 : 401);
  }

  const key = Deno.env.get('AZURE_SPEECH_KEY');
  const region = Deno.env.get('AZURE_SPEECH_REGION');
  if (!key || !region) return json({ error: 'Pronunciation checking is not set up.' }, 503);

  const assessment = btoa(
    String.fromCharCode(
      ...new TextEncoder().encode(
        JSON.stringify({ ReferenceText: text, GradingSystem: 'HundredMark', Granularity: 'Phoneme', Dimension: 'Comprehensive' }),
      ),
    ),
  );
  const res = await fetch(
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=zh-CN&format=detailed`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
        'Pronunciation-Assessment': assessment,
        Accept: 'application/json',
      },
      body: audio,
    },
  );
  if (!res.ok) return json({ error: `Scoring failed (${res.status}). Try again in a moment.` }, 502);
  const result = await res.json();
  const best = result.NBest?.[0];
  if (result.RecognitionStatus !== 'Success' || !best) {
    return json({ error: "Couldn't hear any speech. Speak a little louder and closer to the microphone.", left }, 422);
  }

  // One entry per character: its syllable (pinyin + tone number), score and timing.
  const syllables = (best.Words as AzureWord[]).flatMap((w) => {
    const chars = [...w.Word];
    const phonemes = w.Phonemes ?? [];
    return chars.map((char, i) => {
      const p = phonemes.length === chars.length ? phonemes[i] : undefined;
      const [pinyin, tone] = (p?.Phoneme ?? '').split(' ');
      return {
        char,
        pinyin: pinyin || null,
        tone: tone ? Number(tone) : null,
        accuracy: w.ErrorType === 'Omission' ? 0 : Math.round(p?.AccuracyScore ?? w.AccuracyScore ?? 0),
        error: w.ErrorType,
        start: p ? p.Offset / 1e7 : null,
        end: p ? (p.Offset + p.Duration) / 1e7 : null,
      };
    });
  });

  return json({
    score: Math.round(best.PronScore ?? best.AccuracyScore ?? 0),
    accuracy: Math.round(best.AccuracyScore ?? 0),
    fluency: Math.round(best.FluencyScore ?? 0),
    completeness: Math.round(best.CompletenessScore ?? 0),
    heard: best.Display ?? '',
    syllables,
    left,
  });
});
