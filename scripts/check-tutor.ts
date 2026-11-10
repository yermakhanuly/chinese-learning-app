/**
 * Checks the `tutor` Edge Function end to end on LOCAL Supabase, with Claude replaced by
 * scripts/fake-anthropic.ts (no credit spent). See README → Testing the AI tutor locally.
 *
 *   node scripts/fake-anthropic.ts &
 *   npx supabase functions serve --env-file supabase/functions/.env.fake
 *   node scripts/check-tutor.ts
 *
 * Azure speech is not called (voice and speak need real audio and a key; check those by hand).
 */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => [m[1], m[2]]),
);
const url: string = env.API_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Refusing to run against a non-local Supabase: ${url}`);
const admin = createClient(url, env.SECRET_KEY ?? env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const learner = createClient(url, env.PUBLISHABLE_KEY ?? env.ANON_KEY, { auth: { persistSession: false } });

const { data: signUp, error } = await learner.auth.signUp({ email: `tutor-check-${Date.now()}@e2e.test`, password: 'correct-horse-42' });
if (error || !signUp.user) throw error ?? new Error('sign-up failed');
const userId = signUp.user.id;

async function call(body: Record<string, unknown>): Promise<{ status: number; data: any }> {
  const { data, error } = await learner.functions.invoke('tutor', { body });
  if (!error) return { status: 200, data };
  const res = (error as { context?: Response }).context;
  return { status: res?.status ?? 0, data: await res?.json().catch(() => null) };
}

let checks = 0;
const ok = (what: string, cond: boolean, detail?: unknown) => {
  assert.ok(cond, `${what}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
  checks++;
  console.log(`✔ ${what}`);
};

const locked = await call({ action: 'check', text: '我喜欢很米饭' });
ok('learners without Premium are refused', locked.status === 403, locked);
const self = await learner.from('profiles').update({ premium_until: '2099-01-01' }).eq('id', userId);
ok('learners cannot switch Premium on themselves', !!self.error);
await admin.from('profiles').update({ premium_until: new Date(Date.now() + 86400e3).toISOString() }).eq('id', userId);

const start = await call({ action: 'start', mode: 'roleplay', scenario_id: 'restaurant' });
ok('a role-play starts with its written opening line', start.data?.messages?.[0]?.text === '你好！你想吃什么？', start.data);
const id = start.data.conversation.id;
const turn = await call({ action: 'send', conversation_id: id, text: '我一个米饭要' });
const [mine, reply] = turn.data?.messages ?? [];
ok('a turn saves the learner message with its correction', mine?.data?.correction?.corrected === '我要一个米饭。', turn.data);
ok('goals outside the scenario are dropped', JSON.stringify(reply?.data?.goals_done) === '[0]', reply);
const insert = await learner.from('tutor_messages').insert({ conversation_id: id, user_id: userId, role: 'user', text: 'x' });
ok('learners cannot write messages directly', !!insert.error);
const finish = await call({ action: 'finish', conversation_id: id });
ok('feedback scores are kept within 0–100', finish.data?.feedback?.score === 100, finish.data);
const after = await call({ action: 'send', conversation_id: id, text: '你好' });
ok('a finished conversation takes no more messages', after.status === 409, after);

const tutorChat = await call({ action: 'start', mode: 'tutor' });
await call({ action: 'send', conversation_id: tutorChat.data.conversation.id, text: 'How do I use 是?' });
const title = (await learner.from('tutor_conversations').select('title').eq('id', tutorChat.data.conversation.id).single()).data?.title;
ok('a tutor chat is named after its first question', title === 'How do I use 是?', title);

for (const action of ['check', 'explain']) {
  const r = await call({ action, text: '我在家。' });
  ok(`${action} returns a result`, r.status === 200 && !!r.data, r);
}
ok('examples returns sentences', (await call({ action: 'examples', word: '水' })).data?.examples?.length > 0);
ok('a quiz needs some learned words', (await call({ action: 'quiz' })).status === 422);
for (const w of ['水', '茶', '米饭', '喝', '吃']) {
  await admin.from('review_cards').insert({ user_id: userId, kind: 'word', direction: 'read', word: w, source: 'saved', hsk_level: 1 });
}
const quiz = await call({ action: 'quiz' });
ok('quiz questions with duplicate options are dropped', quiz.data?.questions?.length === 3, quiz.data);
ok('too-long messages are refused', (await call({ action: 'send', conversation_id: tutorChat.data.conversation.id, text: '好'.repeat(301) })).status === 400);

const activity = (await learner.from('activity').select('kind, xp')).data ?? [];
ok('each learner message earns 2 XP', activity.filter((a) => a.kind === 'conversation').length === 2, activity);
const usage = (await learner.from('tutor_usage').select('requests')).data?.[0];
ok('token use is recorded', (usage?.requests ?? 0) >= 6, usage);

console.log(`\n${checks} checks passed`);
