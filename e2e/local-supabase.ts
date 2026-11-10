import { execFileSync } from 'node:child_process';

/**
 * End-to-end tests always run against the LOCAL Supabase in Docker, never the cloud project the
 * app uses in .env.local: they create throwaway users and read reset codes from Mailpit.
 * Values come from `supabase status` and are cached in process.env for the test workers.
 */
export function localSupabase(): { url: string; key: string; serviceKey: string } {
  if (!process.env.E2E_SUPABASE_URL || !process.env.E2E_SUPABASE_KEY || !process.env.E2E_SUPABASE_SERVICE_KEY) {
    let out: string;
    try {
      out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      throw new Error('Local Supabase is not running. Start it with `npm run db:start` (and `npm run data:import`).');
    }
    const env = Object.fromEntries(
      out
        .split('\n')
        .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
        .filter((m): m is RegExpMatchArray => !!m)
        .map((m) => [m[1], m[2]]),
    );
    process.env.E2E_SUPABASE_URL = env.API_URL;
    process.env.E2E_SUPABASE_KEY = env.PUBLISHABLE_KEY ?? env.ANON_KEY;
    // Only for test set-up the app can't do itself (e.g. switching Premium on, as Phase 10 payments will).
    process.env.E2E_SUPABASE_SERVICE_KEY = env.SECRET_KEY ?? env.SERVICE_ROLE_KEY;
  }
  const url = process.env.E2E_SUPABASE_URL!;
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error(`Refusing to run e2e tests against a non-local Supabase: ${url}`);
  }
  return { url, key: process.env.E2E_SUPABASE_KEY!, serviceKey: process.env.E2E_SUPABASE_SERVICE_KEY! };
}
