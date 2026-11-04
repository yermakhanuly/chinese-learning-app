import { useState } from 'react';

import { Button } from '@/components/button';
import { useGoogleEnabled } from '@/hooks/use-google-enabled';
import { friendlyAuthError } from '@/lib/auth-helpers';
import { signInWithGoogle } from '@/lib/auth';

/** "Continue with Google" — hidden until Google login is configured on the server. */
export function GoogleButton({ onSignedIn, onError }: { onSignedIn: () => void; onError: (message: string) => void }) {
  const enabled = useGoogleEnabled();
  const [busy, setBusy] = useState(false);
  if (!enabled) return null;

  async function press() {
    setBusy(true);
    try {
      if (await signInWithGoogle()) onSignedIn();
    } catch (e) {
      onError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  return <Button label="Continue with Google" variant="secondary" loading={busy} onPress={press} />;
}
