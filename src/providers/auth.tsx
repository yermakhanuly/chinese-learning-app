import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { registerAppStateListeners } from '@/lib/app-state';
import { registerAuthDeepLinks } from '@/lib/auth-links';
import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  /** Error from the last login link (shown on /auth/callback). */
  linkError: string | null;
  /** False until the stored session has been read (keep the splash screen up until then). */
  initialized: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, linkError: null, initialized: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<Omit<AuthState, 'linkError'>>({ session: null, initialized: false });
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    registerAppStateListeners();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ session, initialized: true });
      // Drop the previous learner's cached data so nothing leaks between accounts.
      if (event === 'SIGNED_OUT') queryClient.removeQueries({ queryKey: ['profile'] });
    });
    const removeLinks = registerAuthDeepLinks(setLinkError);
    return () => {
      data.subscription.unsubscribe();
      removeLinks();
    };
  }, [queryClient]);

  return <AuthContext value={{ ...state, linkError }}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  return use(AuthContext);
}
