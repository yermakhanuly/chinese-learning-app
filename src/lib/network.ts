/** Web: the browser's online state. */
const listeners = new Set<(online: boolean) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => listeners.forEach((l) => l(true)));
  window.addEventListener('offline', () => listeners.forEach((l) => l(false)));
}

export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

export function onOnlineChange(listener: (online: boolean) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
