/**
 * Checks the Stripe webhook and billing functions on LOCAL Supabase without a Stripe account:
 * events are signed with the test secret from supabase/functions/.env.fake (README → Testing
 * payments locally), the way Stripe signs them.
 *
 *   npx supabase functions serve --env-file supabase/functions/.env.fake
 *   node scripts/check-billing.ts
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const env = Object.fromEntries(
  execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => [m[1], m[2]]),
);
const url: string = env.API_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Refusing to run against a non-local Supabase: ${url}`);
const fake = Object.fromEntries(
  readFileSync('supabase/functions/.env.fake', 'utf8')
    .split('\n')
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => [m[1], m[2]]),
);
const secret = fake.STRIPE_WEBHOOK_SECRET;
assert.ok(secret?.startsWith('whsec_test'), 'supabase/functions/.env.fake needs a test STRIPE_WEBHOOK_SECRET');

const admin = createClient(url, env.SECRET_KEY ?? env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const learner = createClient(url, env.PUBLISHABLE_KEY ?? env.ANON_KEY, { auth: { persistSession: false } });
const stripe = new Stripe('sk_test_unused');

const { data: signUp, error } = await learner.auth.signUp({ email: `billing-${Date.now()}@e2e.test`, password: 'correct-horse-42' });
if (error || !signUp.user) throw error ?? new Error('sign-up failed');
const userId = signUp.user.id;
const customer = `cus_test_${Date.now()}`;

let checks = 0;
const ok = (what: string, cond: boolean, detail?: unknown) => {
  assert.ok(cond, `${what}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
  checks++;
  console.log(`✔ ${what}`);
};

const now = Math.floor(Date.now() / 1000);
function event(type: string, sub: Record<string, unknown>, created = now) {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    object: 'event',
    type,
    created,
    api_version: '2026-09-30.endive',
    data: {
      object: {
        id: 'sub_test_1',
        object: 'subscription',
        customer,
        status: 'trialing',
        cancel_at_period_end: false,
        trial_end: now + 7 * 86400,
        metadata: {},
        items: { object: 'list', data: [{ id: 'si_1', price: { id: 'price_monthly_test' }, current_period_end: now + 7 * 86400 }] },
        ...sub,
      },
    },
  };
}
async function send(payload: unknown, signature?: string) {
  const body = JSON.stringify(payload);
  const header = signature ?? stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  const res = await fetch(`${url}/functions/v1/stripe-webhook`, { method: 'POST', headers: { 'Stripe-Signature': header, 'Content-Type': 'application/json' }, body });
  return { status: res.status, text: await res.text() };
}
const premium = async () => (await learner.rpc('my_premium')).data as { premium: boolean; subscription: { plan: string; status: string } | null };

// What checkout does first: a customer row for the learner.
await admin.from('subscriptions').insert({ user_id: userId, stripe_customer_id: customer, status: 'incomplete' });
ok('an unpaid checkout gives no Premium', !(await premium()).premium);

ok('unsigned events are refused', (await send(event('customer.subscription.created', {}), 't=1,v1=bad')).status === 400);
const created = await send(event('customer.subscription.created', { metadata: { user_id: userId } }));
ok('a signed trial event is accepted', created.status === 200, created);
const p1 = await premium();
ok('the trial switches Premium on (monthly)', p1.premium && p1.subscription?.plan === 'monthly' && p1.subscription.status === 'trialing', p1);

const older = await send(event('customer.subscription.updated', { status: 'canceled' }, now - 3600));
ok('an older event does not overwrite a newer one', older.text.includes('older event') && (await premium()).premium, older);

await send(event('customer.subscription.updated', { status: 'active', items: { object: 'list', data: [{ price: { id: 'price_yearly_test' }, current_period_end: now + 365 * 86400 }] } }, now + 10));
const p2 = await premium();
ok('switching to yearly is recorded', p2.premium && p2.subscription?.plan === 'yearly' && p2.subscription.status === 'active', p2);

await send(event('customer.subscription.deleted', { status: 'canceled' }, now + 20));
ok('cancelling ends Premium', !(await premium()).premium);

const stranger = await send({ ...event('customer.subscription.created', {}), data: { object: { ...event('x', {}).data.object, customer: 'cus_someone_else' } } });
ok('events for unknown customers are ignored', stranger.status === 200 && stranger.text.includes('unknown customer'), stranger);

ok('learners cannot write their own subscription', !!(await learner.from('subscriptions').update({ status: 'active' }).eq('user_id', userId)).error || !(await premium()).premium);

async function billing(body: Record<string, unknown>) {
  const { data, error } = await learner.functions.invoke('billing', { body });
  if (!error) return { status: 200, data };
  const res = (error as { context?: Response }).context;
  return { status: res?.status ?? 0, data: await res?.json().catch(() => null) };
}
const evil = await billing({ action: 'checkout', plan: 'monthly', return_url: 'https://evil.example/steal' });
ok('checkout only returns to the app (no open redirect)', evil.status === 400, evil);
const unknown = await billing({ action: 'checkout', plan: 'weekly', return_url: 'http://localhost:8081/premium' });
ok('unknown plans are refused', unknown.status === 400, unknown);

console.log(`\n${checks} checks passed`);
