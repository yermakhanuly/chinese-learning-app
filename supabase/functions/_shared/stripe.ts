import Stripe from 'npm:stripe@23.0.1';

/** Stripe client for Edge Functions (fetch-based, no Node APIs). */
export function stripeClient(): Stripe {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

export const PRICES = () => ({
  monthly: Deno.env.get('STRIPE_PRICE_MONTHLY') ?? '',
  yearly: Deno.env.get('STRIPE_PRICE_YEARLY') ?? '',
});

export type SubscriptionRow = {
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  plan: 'monthly' | 'yearly' | null;
  status: string;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  updated_at: string;
};

const iso = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : null);

/**
 * The row we keep for a Stripe subscription. The billing period end is on the subscription items
 * (since API version 2025-03-31); the latest item end is used.
 */
export function subscriptionRow(sub: Stripe.Subscription, userId: string): SubscriptionRow {
  const prices = PRICES();
  const items = sub.items?.data ?? [];
  const priceId = items[0]?.price?.id;
  const periodEnd = Math.max(0, ...items.map((i) => i.current_period_end ?? 0));
  return {
    user_id: userId,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    plan: priceId === prices.monthly ? 'monthly' : priceId === prices.yearly ? 'yearly' : null,
    status: sub.status,
    current_period_end: iso(periodEnd || null),
    trial_end: iso(sub.trial_end),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };
}
