/**
 * During development a phone running Expo Go can't reach "127.0.0.1" on the Mac.
 * Swap a localhost Supabase URL for the dev machine's LAN address that Expo already knows.
 */
export function resolveSupabaseUrl(url: string, os: string | undefined, hostUri: string | undefined): string {
  if (os === 'web' || !hostUri) return url;
  const devHost = hostUri.split(':')[0];
  return url.replace(/\/\/(127\.0\.0\.1|localhost)(?=[:/]|$)/, `//${devHost}`);
}
