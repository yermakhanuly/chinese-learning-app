/**
 * Checks the `admin` Edge Function on LOCAL Supabase: every lesson, grammar point, reading and
 * scenario is opened as a draft and run through `check`, which must rebuild exactly the row the
 * import made (same pinyin, word details…) and find no problems; the admin-only rules are checked too.
 *
 *   npx supabase functions serve --env-file supabase/functions/.env    (or .env.fake)
 *   node scripts/check-admin.ts
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { createClient } from '@supabase/supabase-js';

import { draftFromRow, type EditKind } from '../src/lib/content-rows.ts';

const env = Object.fromEntries(
  execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => [m[1], m[2]]),
);
const url: string = env.API_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Refusing to run against a non-local Supabase: ${url}`);
const service = createClient(url, env.SECRET_KEY ?? env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const me = createClient(url, env.PUBLISHABLE_KEY ?? env.ANON_KEY, { auth: { persistSession: false } });

const { data: signUp, error } = await me.auth.signUp({ email: `admin-check-${Date.now()}@e2e.test`, password: 'correct-horse-42' });
if (error || !signUp.user) throw error ?? new Error('sign-up failed');
const userId = signUp.user.id;

async function call(body: Record<string, unknown>): Promise<{ status: number; data: any }> {
  const { data, error } = await me.functions.invoke('admin', { body });
  if (!error) return { status: 200, data };
  const res = (error as { context?: Response }).context;
  return { status: res?.status ?? 0, data: await res?.json().catch(() => null) };
}

assert.equal((await call({ action: 'check', draft_id: 'x' })).status, 403, 'non-admins are refused');
assert.ok((await me.from('profiles').update({ is_admin: true }).eq('id', userId)).error, 'learners cannot make themselves admin');
await service.from('profiles').update({ is_admin: true }).eq('id', userId);
console.log('✔ admins only');

// Same JSON whatever the key order (the database stores jsonb).
const norm = (v: unknown) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));

let failures = 0;
for (const [kind, table] of [
  ['lesson', 'lessons'],
  ['grammar', 'grammar_points'],
  ['reading', 'reading_texts'],
  ['scenario', 'tutor_scenarios'],
  ['unit', 'units'],
] as [EditKind, string][]) {
  const { data: rows, error: e } = await me.from(table).select('*').order('id');
  if (e) throw e;
  let same = 0;
  for (const row of rows as Record<string, unknown>[]) {
    const id = row.id as string;
    await service.from('content_drafts').delete().eq('kind', kind).eq('ref_id', id).eq('status', 'draft');
    const { data: d, error: de } = await me.from('content_drafts').insert({ kind, ref_id: id, data: draftFromRow(kind, row), created_by: userId }).select('id').single();
    if (de) throw de;
    const r = await call({ action: 'check', draft_id: d.id });
    await service.from('content_drafts').delete().eq('id', d.id);
    const diff = Object.keys(r.data?.row ?? {}).filter((k) => norm(r.data.row[k]) !== norm(row[k]));
    if (r.status !== 200 || diff.length || r.data.problems.length) {
      failures++;
      console.log(`✖ ${kind} ${id}: ${r.status !== 200 ? JSON.stringify(r.data) : [...diff.map((k) => `differs: ${k}`), ...r.data.problems].join('; ')}`);
    } else same++;
  }
  console.log(`✔ ${kind}: ${same} of ${rows!.length} rebuilt exactly`);
}

const { data: broken } = await me
  .from('content_drafts')
  .insert({ kind: 'grammar', ref_id: 'g1-check', is_new: true, data: { id: 'g1-check', level: 1, exercises: 'oops' }, created_by: userId })
  .select('id')
  .single();
assert.equal((await call({ action: 'check', draft_id: broken!.id })).status, 422, 'a draft in the wrong shape is refused');
assert.ok((await me.from('content_drafts').update({ status: 'published' }).eq('id', broken!.id)).error, 'admins cannot mark drafts published by hand');
await service.from('content_drafts').delete().eq('id', broken!.id);
console.log('✔ broken drafts are refused; only the function publishes');

if (failures) {
  console.log(`\n${failures} items differ`);
  process.exit(1);
}
console.log('\nAll checks passed');
