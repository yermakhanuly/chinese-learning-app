import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * False while the web's pre-built HTML is being hydrated, true afterwards (always true on iPhone).
 * The HTML is built without URL parameters and React doesn't fix mismatched attributes when it
 * hydrates, so UI that depends on ?params should wait for this.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
