import { useQuery } from '@tanstack/react-query';

import { fetchGoogleEnabled } from '@/lib/auth';

/** Show the Google button only when the provider is configured on the server. */
export function useGoogleEnabled(): boolean {
  const { data } = useQuery({ queryKey: ['auth-settings', 'google'], queryFn: fetchGoogleEnabled, staleTime: Infinity });
  return data === true;
}
