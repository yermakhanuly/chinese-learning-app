import { createClient } from '@supabase/supabase-js';
import { expect, type Page } from '@playwright/test';

import { localSupabase } from './local-supabase';

export const { url: SUPABASE_URL, key: SUPABASE_KEY, serviceKey: SUPABASE_SERVICE_KEY } = localSupabase();
export const MAILPIT_URL = 'http://127.0.0.1:54324';
export const PASSWORD = 'correct-horse-42';

export function newClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
}

/** Local service-role client, for set-up the app can't do itself (never used by the app). */
export function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
}

/** Switches Premium on for a learner (Phase 10 payments will do this). */
export async function makePremium(userId: string) {
  const { error } = await adminClient()
    .from('profiles')
    .update({ premium_until: new Date(Date.now() + 30 * 86400e3).toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

export function uniqueEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
}

/** Creates an account through the API and finishes onboarding, so UI tests can start signed-in-ready. */
export async function createOnboardedUser(name: string) {
  const email = uniqueEmail(name.toLowerCase());
  const client = newClient();
  const { data, error } = await client.auth.signUp({ email, password: PASSWORD, options: { data: { display_name: name } } });
  if (error || !data.user) throw error ?? new Error('sign-up failed');
  const now = new Date().toISOString();
  const upd = await client
    .from('profiles')
    .update({ learning_goal: 'travel', self_level: 'beginner', onboarded_at: now, tutorial_completed_at: now })
    .eq('id', data.user.id);
  if (upd.error) throw upd.error;
  return { email, client, userId: data.user.id };
}

export async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^你好, / })).toBeVisible();
}

/** Latest 6-digit code mailed to `email` by the local mail catcher (Mailpit). */
export async function latestCode(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const body = (await res.json()) as { messages: { ID: string }[] };
    if (body.messages?.length) {
      const msg = await (await fetch(`${MAILPIT_URL}/api/v1/message/${body.messages[0].ID}`)).json();
      const code = String(msg.Text ?? msg.HTML).match(/\b(\d{6})\b/);
      if (code) return code[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no email for ${email}`);
}
