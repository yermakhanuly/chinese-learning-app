import * as Linking from 'expo-linking';

import { completeAuthRedirect } from '@/lib/auth';
import { friendlyAuthError, parseAuthRedirect } from '@/lib/auth-helpers';

/**
 * iPhone: login links that open the app directly (e.g. if the in-app browser sheet hands the
 * redirect to the system) carry the tokens in the URL. Expo Router drops the "#..." part, so
 * listen to the raw URLs here instead of in a screen.
 */
export function registerAuthDeepLinks(onError: (message: string) => void): () => void {
  const handle = (url: string | null) => {
    if (!url || parseAuthRedirect(url).kind === 'none') return;
    completeAuthRedirect(url).catch((e) => onError(friendlyAuthError(e)));
  };
  Linking.getInitialURL().then(handle);
  const sub = Linking.addEventListener('url', ({ url }) => handle(url));
  return () => sub.remove();
}
