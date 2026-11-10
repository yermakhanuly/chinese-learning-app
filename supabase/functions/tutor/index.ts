/**
 * AI tutor (premium learners only). POST JSON { action, … }:
 *   start    { mode: 'tutor' | 'roleplay' | 'free', scenario_id?, topic? } → { conversation, messages }
 *   send     { conversation_id, text }                                     → { messages }
 *   voice    { conversation_id, audio: base64 16 kHz WAV }                 → { messages, heard, audio_path }
 *   speak    { text, voice? }                                              → { audio_path }
 * (audio_path: a signed Storage path, relative to the project URL the app already knows.)
 *   finish   { conversation_id }                                           → { feedback }
 *   check    { text }  explain { text }  examples { word }  quiz {}        → the result
 *
 * Claude Sonnet 5.5 writes every reply (the API key never leaves the server); Azure Speech turns the
 * learner's voice into text and reads replies aloud. Conversations are saved with the service role;
 * learners can only read them. Token use is recorded per learner per day (tutor_usage).
 *
 * Secrets: ANTHROPIC_API_KEY, AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (supabase secrets set …; locally
 * supabase/functions/.env). ANTHROPIC_BASE_URL is only for local tests against a fake API.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@1.4.0';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  LIMITS,
  SCHEMAS,
  checkSystem,
  examplesSystem,
  explainSystem,
  feedbackSystem,
  freeSystem,
  historyMessages,
  pinyinOf,
  quizSystem,
  roleplaySystem,
  transcript,
  tutorSystem,
  type LearnerContext,
  type ScenarioRow,
} from './prompts.ts';

const MODEL = 'claude-sonnet-5-5';
const VOICES = { female: 'zh-CN-XiaoxiaoNeural', male: 'zh-CN-YunxiNeural' } as const;
const MAX_AUDIO = 1_100_000; // ~34 s of 16 kHz 16-bit audio

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const text = (v: unknown, max: number, what: string): string => {
  const t = typeof v === 'string' ? v.trim() : '';
  if (!t) throw new HttpError(400, `Missing ${what}.`);
  if (t.length > max) throw new HttpError(400, `That ${what} is too long (at most ${max} characters).`);
  return t;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  try {
    return json(await handle(req));
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong. Try again in a moment.' }, 500);
  }
});

async function handle(req: Request): Promise<unknown> {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) throw new HttpError(401, 'Log in to use the AI tutor.');
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, 'Expected JSON.');
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: auth } = await db.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) throw new HttpError(401, 'Log in to use the AI tutor.');
  const { data: premium, error: premiumError } = await db.rpc('is_premium', { p_user: user.id });
  if (premiumError) throw premiumError;
  if (!premium) throw new HttpError(403, 'The AI tutor is part of Premium.');

  const ctx = await learnerContext(db, user.id);
  const ai = new Tutor(db, user.id);

  switch (body.action) {
    case 'start':
      return start(db, ai, user.id, ctx, body);
    case 'send':
      return turn(db, ai, user.id, ctx, body.conversation_id, text(body.text, LIMITS.message, 'message'), false);
    case 'voice': {
      const heard = await speechToText(body.audio);
      const result = await turn(db, ai, user.id, ctx, body.conversation_id, heard, true);
      const reply = result.messages[result.messages.length - 1];
      const audio_path = await textToSpeech(db, reply.text, result.voice);
      return { ...result, heard, audio_path };
    }
    case 'speak':
      return { audio_path: await textToSpeech(db, text(body.text, LIMITS.message, 'text'), body.voice === 'male' ? 'male' : 'female') };
    case 'finish':
      return finish(db, ai, user.id, ctx, body.conversation_id);
    case 'check':
      return ai.json(checkSystem(ctx), text(body.text, LIMITS.sentence, 'sentence'), SCHEMAS.check, 'medium');
    case 'explain':
      return ai.json(explainSystem(ctx), text(body.text, LIMITS.sentence, 'sentence'), SCHEMAS.explain, 'medium');
    case 'examples': {
      const word = text(body.word, LIMITS.word, 'word');
      return ai.json(examplesSystem(ctx), `The word: ${word}`, SCHEMAS.examples, 'low');
    }
    case 'quiz': {
      const words = [...new Set([...ctx.recent_words, ...ctx.weak_words])].slice(0, 20);
      if (words.length < 4) throw new HttpError(422, 'Learn a few more words first (finish a lesson or save some words).');
      const quiz = await ai.json<{ questions: { options: string[]; answer: number }[] }>(
        quizSystem(ctx),
        `Words learned recently: ${words.join('、')}`,
        SCHEMAS.quiz,
        'low',
      );
      const questions = quiz.questions.filter(
        (q) => q.options.length >= 2 && new Set(q.options).size === q.options.length && q.answer >= 0 && q.answer < q.options.length,
      );
      if (questions.length < 3) throw new HttpError(502, "Couldn't make a quiz this time. Try again.");
      return { questions };
    }
    default:
      throw new HttpError(400, 'Unknown action.');
  }
}

// --- Learner and conversation data ------------------------------------------------------------

async function learnerContext(db: SupabaseClient, userId: string): Promise<LearnerContext> {
  const { data, error } = await db.rpc('tutor_context', { p_user: userId });
  if (error) throw error;
  return data as LearnerContext;
}

type MessageRow = { id: number; role: 'user' | 'assistant'; text: string; data: Record<string, unknown>; created_at: string };
const MESSAGE_FIELDS = 'id, role, text, data, created_at';
const CONVERSATION_FIELDS = 'id, mode, scenario_id, topic, title, level, created_at, updated_at, finished_at, feedback';

async function scenario(db: SupabaseClient, id: unknown): Promise<ScenarioRow> {
  if (typeof id !== 'string') throw new HttpError(400, 'Missing scenario.');
  const { data, error } = await db
    .from('tutor_scenarios')
    .select('id, hsk_level, title, setting, ai_role, learner_role, goals, voice, opening, readings')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'No such scenario.');
  return data as ScenarioRow;
}

async function conversationOf(db: SupabaseClient, userId: string, id: unknown) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, 'Missing conversation.');
  const { data, error } = await db
    .from('tutor_conversations')
    .select('id, mode, scenario_id, topic, title, level, finished_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'Conversation not found.');
  return data as { id: string; mode: 'tutor' | 'roleplay' | 'free'; scenario_id: string | null; topic: string | null; title: string; level: number; finished_at: string | null };
}

async function messagesOf(db: SupabaseClient, conversationId: string): Promise<MessageRow[]> {
  const { data, error } = await db
    .from('tutor_messages')
    .select(MESSAGE_FIELDS)
    .eq('conversation_id', conversationId)
    .order('id')
    .limit(400);
  if (error) throw error;
  return data as MessageRow[];
}

async function addMessages(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
  rows: { role: 'user' | 'assistant'; text: string; data: Record<string, unknown> }[],
): Promise<MessageRow[]> {
  // One at a time, so ids (and the order shown) follow the conversation.
  const out: MessageRow[] = [];
  for (const r of rows) {
    const { data, error } = await db
      .from('tutor_messages')
      .insert({ ...r, conversation_id: conversationId, user_id: userId })
      .select(MESSAGE_FIELDS)
      .single();
    if (error) throw error;
    out.push(data as MessageRow);
  }
  const { error } = await db.from('tutor_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
  if (error) throw error;
  return out;
}

// --- Actions ------------------------------------------------------------------------------------

const TUTOR_HELLO =
  "Hi! I'm your Chinese tutor. Ask me anything about Chinese: what a word means, how to say something, why a sentence works the way it does, or how to write a character.";

async function start(db: SupabaseClient, ai: Tutor, userId: string, ctx: LearnerContext, body: Record<string, unknown>) {
  const mode = body.mode;
  let row: { mode: string; scenario_id?: string; topic?: string; title: string; level: number };
  let first: { text: string; data: Record<string, unknown> };
  if (mode === 'roleplay') {
    const s = await scenario(db, body.scenario_id);
    row = { mode, scenario_id: s.id, title: s.title, level: Math.max(ctx.level, s.hsk_level) };
    // The opening line is written content, so starting a role-play costs nothing.
    first = { text: s.opening.zh, data: { pinyin: pinyinOf(s.readings[s.opening.zh]), en: s.opening.en } };
  } else if (mode === 'free') {
    const topic = text(body.topic, LIMITS.topic, 'topic');
    row = { mode, topic, title: topic, level: ctx.level };
    const opener = await ai.json<{ reply: { zh: string; pinyin: string; en: string } }>(
      freeSystem(topic, ctx),
      '(The conversation begins. Greet the learner and start talking about the topic.)',
      SCHEMAS.opener,
      'low',
    );
    first = { text: opener.reply.zh, data: { pinyin: opener.reply.pinyin, en: opener.reply.en } };
  } else if (mode === 'tutor') {
    row = { mode, title: 'Ask the tutor', level: ctx.level };
    first = { text: TUTOR_HELLO, data: {} };
  } else {
    throw new HttpError(400, 'Unknown mode.');
  }
  const { data: conversation, error } = await db
    .from('tutor_conversations')
    .insert({ ...row, user_id: userId })
    .select(CONVERSATION_FIELDS)
    .single();
  if (error) throw error;
  const messages = await addMessages(db, userId, conversation.id, [{ role: 'assistant', ...first }]);
  return { conversation, messages };
}

type Reply = {
  reply: { zh: string; pinyin: string; en: string };
  correction: { ok: boolean; corrected: string; corrected_pinyin: string; explanation: string; kind: string };
  goals_done: number[];
};

async function turn(
  db: SupabaseClient,
  ai: Tutor,
  userId: string,
  ctx: LearnerContext,
  conversationId: unknown,
  said: string,
  voice: boolean,
) {
  const c = await conversationOf(db, userId, conversationId);
  if (c.finished_at) throw new HttpError(409, 'This conversation has finished. Start a new one.');
  const history = await messagesOf(db, c.id);
  const convo = historyMessages([...history, { role: 'user', text: said }], LIMITS.history);
  const atLevel = { ...ctx, level: c.level };

  if (c.mode === 'tutor') {
    if (voice) throw new HttpError(400, 'Voice is for role-plays and conversations.');
    const answer = await ai.text(tutorSystem(atLevel), convo);
    const messages = await addMessages(db, userId, c.id, [
      { role: 'user', text: said, data: {} },
      { role: 'assistant', text: answer, data: {} },
    ]);
    // Name the chat after its first question.
    if (history.filter((m) => m.role === 'user').length === 0) {
      await db.from('tutor_conversations').update({ title: said.slice(0, 60) }).eq('id', c.id);
    }
    return { messages, voice: 'female' as const };
  }

  let system: string;
  let goals = 0;
  let voiceName: 'female' | 'male' = 'female';
  if (c.mode === 'roleplay') {
    const s = await scenario(db, c.scenario_id);
    system = roleplaySystem(s, atLevel);
    goals = s.goals.length;
    voiceName = s.voice;
  } else {
    system = freeSystem(c.topic ?? 'everyday life', atLevel);
  }
  const r = await ai.json<Reply>(system, convo, SCHEMAS.conversation, 'low');
  const goals_done = [...new Set(r.goals_done)].filter((g) => Number.isInteger(g) && g >= 0 && g < goals).sort();
  const correction = r.correction.ok
    ? { ok: true, corrected: said, corrected_pinyin: '', explanation: '', kind: '' }
    : r.correction;
  const messages = await addMessages(db, userId, c.id, [
    { role: 'user', text: said, data: { correction, ...(voice ? { voice: true } : {}) } },
    { role: 'assistant', text: r.reply.zh, data: { pinyin: r.reply.pinyin, en: r.reply.en, goals_done } },
  ]);
  return { messages, voice: voiceName };
}

async function finish(db: SupabaseClient, ai: Tutor, userId: string, ctx: LearnerContext, conversationId: unknown) {
  const c = await conversationOf(db, userId, conversationId);
  if (c.mode === 'tutor') throw new HttpError(400, 'Tutor chats have no summary.');
  const messages = await messagesOf(db, c.id);
  if (!messages.some((m) => m.role === 'user')) throw new HttpError(422, 'Say something first.');
  const context = c.mode === 'roleplay' ? `Role-play: ${c.title}` : `Free conversation about: ${c.topic}`;
  const feedback = await ai.json<{ score: number }>(
    feedbackSystem({ ...ctx, level: c.level }),
    `${context}\n\n${transcript(messages as Parameters<typeof transcript>[0])}`,
    SCHEMAS.feedback,
    'medium',
  );
  feedback.score = Math.max(0, Math.min(100, Math.round(feedback.score)));
  const { error } = await db
    .from('tutor_conversations')
    .update({ feedback, finished_at: new Date().toISOString() })
    .eq('id', c.id);
  if (error) throw error;
  return { feedback };
}

// --- Claude -------------------------------------------------------------------------------------

class Tutor {
  private client: Anthropic | null;
  constructor(
    private db: SupabaseClient,
    private userId: string,
  ) {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    this.client = apiKey ? new Anthropic({ apiKey, baseURL: Deno.env.get('ANTHROPIC_BASE_URL') || undefined, maxRetries: 2 }) : null;
  }

  private async call(
    system: string,
    messages: string | { role: 'user' | 'assistant'; content: string }[],
    effort: 'low' | 'medium',
    schema?: Record<string, unknown>,
  ) {
    if (!this.client) throw new HttpError(503, 'The AI tutor is not set up yet.');
    let res: Anthropic.Beta.BetaMessage;
    try {
      res = await this.client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        // The system prompt (instructions + what the learner knows) is the same for every turn of a
        // conversation, so it is cached.
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: typeof messages === 'string' ? [{ role: 'user', content: messages }] : messages,
        output_config: { effort, ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
        // If a safety check declines a turn, the API retries it on a fallback model it picks.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new HttpError(503, 'The tutor is busy right now. Try again in a minute.');
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        console.error('Anthropic credentials:', e.message);
        throw new HttpError(503, 'The AI tutor is not available right now.');
      }
      if (e instanceof Anthropic.APIError) {
        console.error(`Anthropic ${e.status}:`, e.message);
        throw new HttpError(503, 'The AI tutor is not available right now. Try again later.');
      }
      if (e instanceof Anthropic.APIConnectionError) throw new HttpError(503, "Couldn't reach the AI tutor. Try again.");
      throw e;
    }
    const u = res.usage;
    await this.db.rpc('record_tutor_usage', {
      p_user: this.userId,
      p_input: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
      p_output: u.output_tokens ?? 0,
    });
    if (res.stop_reason === 'refusal') throw new HttpError(422, "The tutor can't help with that. Try saying it another way.");
    if (res.stop_reason === 'max_tokens') throw new HttpError(502, 'The answer was too long. Try a shorter question.');
    const out = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim();
    if (!out) throw new HttpError(502, 'The tutor gave no answer. Try again.');
    return out;
  }

  text(system: string, messages: { role: 'user' | 'assistant'; content: string }[]) {
    return this.call(system, messages, 'low');
  }

  async json<T>(
    system: string,
    messages: string | { role: 'user' | 'assistant'; content: string }[],
    schema: Record<string, unknown>,
    effort: 'low' | 'medium',
  ): Promise<T> {
    const out = await this.call(system, messages, effort, schema);
    try {
      return JSON.parse(out) as T;
    } catch {
      throw new HttpError(502, 'The tutor gave a broken answer. Try again.');
    }
  }
}

// --- Azure Speech ---------------------------------------------------------------------------------

function azure() {
  const key = Deno.env.get('AZURE_SPEECH_KEY');
  const region = Deno.env.get('AZURE_SPEECH_REGION');
  if (!key || !region) throw new HttpError(503, 'Voice is not set up yet.');
  return { key, region };
}

async function speechToText(audio64: unknown): Promise<string> {
  if (typeof audio64 !== 'string' || audio64.length > MAX_AUDIO * 1.4) throw new HttpError(400, 'Recording is too long.');
  let audio: Uint8Array;
  try {
    audio = Uint8Array.from(atob(audio64), (c) => c.charCodeAt(0));
  } catch {
    throw new HttpError(400, 'Invalid recording.');
  }
  if (audio.length < 3200 || audio.length > MAX_AUDIO) throw new HttpError(400, 'Recording is too short or too long.');
  const tag = (o: number) => String.fromCharCode(...audio.slice(o, o + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new HttpError(400, 'Expected a WAV recording.');
  const { key, region } = azure();
  const res = await fetch(
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=zh-CN&format=simple`,
    {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000', Accept: 'application/json' },
      body: audio,
    },
  );
  if (!res.ok) throw new HttpError(502, `Couldn't recognise speech (${res.status}). Try again.`);
  const result = await res.json();
  const heard = typeof result.DisplayText === 'string' ? result.DisplayText.trim() : '';
  if (result.RecognitionStatus !== 'Success' || !heard) {
    throw new HttpError(422, "Couldn't hear any speech. Hold the button while you speak, a little closer to the microphone.");
  }
  return heard.slice(0, LIMITS.message);
}

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

async function sha256(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Reads `zh` aloud in a natural voice. The MP3 is cached by text and handed out as a signed path
 * (/storage/v1/object/sign/…): the URL the function sees for Storage is internal when run locally.
 */
async function textToSpeech(db: SupabaseClient, zh: string, voice: 'female' | 'male'): Promise<string> {
  const path = `tts/${await sha256(`${VOICES[voice]}|${zh}`)}.mp3`;
  const bucket = db.storage.from('tutor-audio');
  const signed = async () => {
    const { data, error } = await bucket.createSignedUrl(path, 60 * 60);
    if (error || !data) return null;
    const u = new URL(data.signedUrl);
    return u.pathname + u.search;
  };
  const cached = await signed();
  if (cached) return cached;

  const { key, region } = azure();
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'hsk-chinese-tutor',
    },
    body: `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN"><voice name="${VOICES[voice]}"><prosody rate="-10%">${escapeXml(zh)}</prosody></voice></speak>`,
  });
  if (!res.ok) throw new HttpError(502, `Couldn't make the audio (${res.status}).`);
  const mp3 = new Uint8Array(await res.arrayBuffer());
  const up = await bucket.upload(path, mp3, { contentType: 'audio/mpeg', upsert: true });
  if (up.error) throw up.error;
  const made = await signed();
  if (!made) throw new Error('could not sign the audio');
  return made;
}
