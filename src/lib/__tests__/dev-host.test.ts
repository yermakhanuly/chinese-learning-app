import { resolveSupabaseUrl } from '../dev-host';

describe('resolveSupabaseUrl', () => {
  const local = 'http://127.0.0.1:54321';

  it('swaps localhost for the dev machine address on iPhone', () => {
    expect(resolveSupabaseUrl(local, 'ios', '192.168.0.18:8081')).toBe('http://192.168.0.18:54321');
    expect(resolveSupabaseUrl('http://localhost:54321', 'ios', '10.0.0.5:8081')).toBe('http://10.0.0.5:54321');
  });

  it('leaves web and cloud URLs alone', () => {
    expect(resolveSupabaseUrl(local, 'web', '192.168.0.18:8081')).toBe(local);
    expect(resolveSupabaseUrl('https://abc.supabase.co', 'ios', '192.168.0.18:8081')).toBe('https://abc.supabase.co');
  });

  it('leaves the URL alone when no dev host is known (release builds)', () => {
    expect(resolveSupabaseUrl(local, 'ios', undefined)).toBe(local);
  });
});
