import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/** Records an unexpected Edge Function error in client_errors (shown in the admin dashboard). */
export async function logFunctionError(db: SupabaseClient, fn: string, error: unknown, userId?: string | null) {
  const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
  console.error(fn, e);
  try {
    await db.from('client_errors').insert({
      user_id: userId ?? null,
      source: 'function',
      message: `${fn}: ${e.message}`.slice(0, 1000),
      stack: e.stack?.slice(0, 4000) ?? null,
      context: { function: fn },
    });
  } catch {
    // Logging must never make things worse.
  }
}
