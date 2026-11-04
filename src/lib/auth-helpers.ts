/** Pure helpers for login forms and OAuth redirects (unit-tested; no React Native imports). */

export const MIN_PASSWORD_LENGTH = 8;

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}

export type RedirectResult =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'error'; message: string }
  | { kind: 'none' };

/** Reads the result of an OAuth redirect: tokens (implicit flow) or an error, in the hash or query. */
export function parseAuthRedirect(url: string): RedirectResult {
  const params = new Map<string, string>();
  const parts = [url.split('#')[1], url.split('#')[0].split('?')[1]];
  for (const part of parts) {
    if (!part) continue;
    for (const pair of part.split('&')) {
      const [k, v = ''] = pair.split('=');
      if (k && !params.has(k)) params.set(decodeURIComponent(k), decodeURIComponent(v.replace(/\+/g, ' ')));
    }
  }
  const error = params.get('error_description') ?? params.get('error');
  if (error) return { kind: 'error', message: error };
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken };
  return { kind: 'none' };
}

/** Turns Supabase Auth error messages into plain sentences for the learner. */
export function friendlyAuthError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const msg = raw.toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Wrong email or password.';
  if (msg.includes('already registered') || msg.includes('already exists'))
    return 'An account with this email already exists. Try logging in instead.';
  if (msg.includes('email not confirmed')) return 'Please confirm your email first — check your inbox.';
  if (msg.includes('token has expired') || msg.includes('otp') || msg.includes('invalid token'))
    return 'That code is wrong or has expired. Request a new one.';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Too many attempts. Wait a minute and try again.';
  if (msg.includes('weak') || msg.includes('password should'))
    return `Choose a stronger password (at least ${MIN_PASSWORD_LENGTH} characters).`;
  if (msg.includes('network') || msg.includes('fetch')) return 'Could not reach the server. Check your connection.';
  return raw || 'Something went wrong. Please try again.';
}
