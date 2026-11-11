import { useMutation, useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

export type PremiumState = {
  premium: boolean;
  /** Premium switched on by hand (admin), until this time. */
  manual_until: string | null;
  subscription: {
    plan: 'monthly' | 'yearly' | null;
    status: string;
    current_period_end: string | null;
    trial_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
};

/** Whether the learner has Premium (by hand or a live Stripe subscription), from the database. */
export function usePremiumState(poll = false) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['premium', session?.user.id],
    enabled: !!session,
    refetchInterval: poll ? 2000 : false,
    queryFn: async (): Promise<PremiumState> => {
      const { data, error } = await supabase.rpc('my_premium');
      if (error) throw error;
      return data as PremiumState;
    },
  });
}

async function billing<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('billing', { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    const res = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
    throw new Error(res?.error ?? "Couldn't reach the payment service. Check your connection.");
  }
  return data as T;
}

export type Plan = { plan: 'monthly' | 'yearly'; amount: number | null; currency: string; interval: string | null };

export function usePlans() {
  return useQuery({
    queryKey: ['billing', 'plans'],
    staleTime: 60 * 60 * 1000,
    retry: false,
    queryFn: () => billing<{ plans: Plan[]; trial_days: number }>({ action: 'plans' }),
  });
}

/** The page Stripe sends learners back to (this page, without query params). */
const here = () => `${window.location.origin}${window.location.pathname}`;

export function useCheckout() {
  return useMutation({
    mutationFn: async (plan: 'monthly' | 'yearly') => {
      const { url } = await billing<{ url: string }>({ action: 'checkout', plan, return_url: here() });
      window.location.assign(url);
    },
  });
}

export function useBillingPortal() {
  return useMutation({
    mutationFn: async () => {
      const { url } = await billing<{ url: string }>({ action: 'portal', return_url: here() });
      window.location.assign(url);
    },
  });
}

export function formatPrice(p: Plan) {
  if (p.amount === null) return '';
  const value = new Intl.NumberFormat(undefined, { style: 'currency', currency: p.currency.toUpperCase() }).format(p.amount / 100);
  return `${value} / ${p.interval === 'year' ? 'year' : 'month'}`;
}
