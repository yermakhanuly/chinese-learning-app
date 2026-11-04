import fs from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';
import { expect, type Page } from '@playwright/test';

function readEnv(): Record<string, string> {
  const file = path.join(__dirname, '..', '.env.local');
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = readEnv();
export const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
export const SUPABASE_KEY = env.EXPO_PUBLIC_SUPABASE_KEY;
export const MAILPIT_URL = 'http://127.0.0.1:54324';
export const PASSWORD = 'correct-horse-42';

export function newClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
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
