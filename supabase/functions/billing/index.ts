/**
 * Premium subscriptions on the web (Stripe; test mode until launch). POST JSON { action, … }:
 *   plans                                   → { plans: [{ plan, amount, currency, interval }], trial_days }
 *   checkout { plan: 'monthly'|'yearly', return_url } → { url }   Stripe Checkout (7-day trial the first time)
 *   portal   { return_url }                 → { url }   Stripe's page to change or cancel
 * Signed-in learners only. Premium itself is switched on by the stripe-webhook function.
 *
 * Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY, APP_ORIGINS (comma-separated
 * origins the app may return to, e.g. https://your-site.example; localhost is always allowed).
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { logFunctionError } from '../_shared/log.ts';
import { PRICES, stripeClient } from '../_shared/stripe.ts';

const TRIAL_DAYS = 7;

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

/** Only send learners back to the app itself (no open redirects). */
function returnUrl(v: unknown): string {
  if (typeof v !== 'string') throw new HttpError(400, 'Missing return_url.');
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new HttpError(400, 'Invalid return_url.');
  }
  const allowed = (Deno.env.get('APP_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (!local && !allowed.includes(u.origin)) throw new HttpError(400, 'That return address is not allowed.');
  return `${u.origin}${u.pathname}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  let userId: string | null = null;
  try {
    const body = await req.json().catch(() => {
      throw new HttpError(400, 'Expected JSON.');
    });
    if (!Deno.env.get('STRIPE_SECRET_KEY')) throw new HttpError(503, 'Subscriptions are not set up yet.');
    const stripe = stripeClient();
    const prices = PRICES();

    if (body.action === 'plans') {
      const plans = [];
      for (const plan of ['monthly', 'yearly'] as const) {
        if (!prices[plan]) continue;
        const p = await stripe.prices.retrieve(prices[plan]);
        plans.push({ plan, amount: p.unit_amount, currency: p.currency, interval: p.recurring?.interval ?? null });
      }
      return json({ plans, trial_days: TRIAL_DAYS });
    }

    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const user = jwt ? (await db.auth.getUser(jwt)).data.user : null;
    if (!user) throw new HttpError(401, 'Log in to subscribe.');
    userId = user.id;
    const { data: existing } = await db.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle();

    if (body.action === 'checkout') {
      const plan = body.plan === 'yearly' ? 'yearly' : body.plan === 'monthly' ? 'monthly' : null;
      if (!plan || !prices[plan]) throw new HttpError(400, 'Unknown plan.');
      const back = returnUrl(body.return_url);
      if (existing && ['trialing', 'active', 'past_due'].includes(existing.status)) {
        throw new HttpError(409, 'You already have Premium. Manage it from the Premium page.');
      }
      const customer = existing?.stripe_customer_id ?? (await newCustomer(db, stripe, user.id, user.email));
      // One free trial per learner.
      const trial = !existing?.stripe_subscription_id && !existing?.trial_end;
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer,
        client_reference_id: user.id,
        line_items: [{ price: prices[plan], quantity: 1 }],
        subscription_data: { metadata: { user_id: user.id }, ...(trial ? { trial_period_days: TRIAL_DAYS } : {}) },
        allow_promotion_codes: true,
        success_url: `${back}?checkout=success`,
        cancel_url: `${back}?checkout=cancelled`,
      });
      return json({ url: session.url });
    }

    if (body.action === 'portal') {
      if (!existing) throw new HttpError(404, 'You have no subscription yet.');
      const session = await stripe.billingPortal.sessions.create({ customer: existing.stripe_customer_id, return_url: returnUrl(body.return_url) });
      return json({ url: session.url });
    }
    throw new HttpError(400, 'Unknown action.');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    await logFunctionError(db, 'billing', e, userId);
    return json({ error: "Couldn't reach the payment service. Try again in a moment." }, 502);
  }
});

async function newCustomer(db: SupabaseClient, stripe: ReturnType<typeof stripeClient>, userId: string, email: string | undefined) {
  const c = await stripe.customers.create({ email, metadata: { user_id: userId } });
  const { error } = await db
    .from('subscriptions')
    .upsert({ user_id: userId, stripe_customer_id: c.id, status: 'incomplete', updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
  return c.id;
}
