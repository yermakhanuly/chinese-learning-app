/**
 * Supabase URL + service key for data scripts: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY when set
 * (cloud), otherwise the local stack from `supabase status`.
 */
import { execFileSync } from 'node:child_process';

export function credentials(root: string): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return { url, key };

  const out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { cwd: root, encoding: 'utf8' });
  const env = Object.fromEntries(
    out
      .split('\n')
      .map((l) => /^([A-Z_]+)="?([^"]*)"?$/.exec(l.trim()))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1], m[2]]),
  );
  const localUrl = env.API_URL;
  const localKey = env.SERVICE_ROLE_KEY ?? env.SECRET_KEY;
  if (!localUrl || !localKey) throw new Error('Local Supabase is not running. Start it with `npm run db:start`.');
  return { url: localUrl, key: localKey };
}
