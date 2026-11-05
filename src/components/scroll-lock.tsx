import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * Lets a drawing surface stop its scroll view while a finger is down, so on iPhone a stroke
 * draws instead of scrolling the page. Scroll views read `locked`; drawing surfaces call `setLocked`.
 */
const ScrollLockContext = createContext<{ locked: boolean; setLocked: (locked: boolean) => void }>({
  locked: false,
  setLocked: () => {},
});

export function ScrollLockProvider({ children }: { children: (locked: boolean) => ReactNode }) {
  const [locked, setLocked] = useState(false);
  return <ScrollLockContext value={{ locked, setLocked }}>{children(locked)}</ScrollLockContext>;
}

export function useScrollLock() {
  return useContext(ScrollLockContext).setLocked;
}
