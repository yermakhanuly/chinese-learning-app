/**
 * Stripe → Premium. Stripe calls this with signed events (no Supabase login: verify_jwt is off for
 * this function in supabase/config.toml). Every event's signature is checked with
 * STRIPE_WEBHOOK_SECRET; subscription events update public.subscriptions, which is_premium() reads.
 *
 * Events: customer.subscription.created / updated / deleted / paused / resumed / trial_will_end.
 * Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY.
 */
import Stripe from 'npm:stripe@23.0.1';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { logFunctionError } from '../_shared/log.ts';
import { stripeClient, subscriptionRow } from '../_shared/stripe.ts';

const crypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Use POST', { status: 405 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const signature = req.headers.get('Stripe-Signature');
  if (!secret || !signature) return new Response('Missing signature', { status: 400 });

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripeClient().webhooks.constructEventAsync(body, signature, secret, undefined, crypto);
  } catch {
    return new Response('Bad signature', { status: 400 });
  }

  try {
    if (event.type.startsWith('customer.subscription.')) {
      const sub = event.data.object as Stripe.Subscription;
      const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      let userId = sub.metadata?.user_id;
      if (!userId) {
        const { data } = await db.from('subscriptions').select('user_id').eq('stripe_customer_id', customer).maybeSingle();
        userId = data?.user_id;
      }
      if (!userId) {
        // Not one of ours (e.g. made by hand in the Stripe dashboard): acknowledge and ignore.
        return new Response(JSON.stringify({ ignored: 'unknown customer' }), { status: 200 });
      }
      // Events can arrive out of order: never let an older event overwrite a newer state.
      const { data: current } = await db.from('subscriptions').select('updated_at, stripe_subscription_id').eq('user_id', userId).maybeSingle();
      const eventTime = new Date(event.created * 1000);
      if (current && current.stripe_subscription_id === sub.id && new Date(current.updated_at) > eventTime) {
        return new Response(JSON.stringify({ ignored: 'older event' }), { status: 200 });
      }
      const row = { ...subscriptionRow(sub, userId), updated_at: eventTime.toISOString() };
      const { error } = await db.from('subscriptions').upsert(row, { onConflict: 'user_id' });
      if (error) throw error;
    }
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    await logFunctionError(db, 'stripe-webhook', e);
    // 500 makes Stripe retry later.
    return new Response('Error', { status: 500 });
  }
});
